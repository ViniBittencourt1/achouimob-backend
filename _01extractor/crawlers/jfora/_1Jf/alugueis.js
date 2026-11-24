import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import cron from 'node-cron';
import { JSDOM } from 'jsdom';
import open from 'open';
import { listarProjetosAlugueis, validarConfiguracaoAlugueis, validarRegistrosAlugueis, filtrosRegistrosAlugueis, duplicadosRegistrosAlugueis } from './alugueis-model.js';
import publicationProfiles from '../../../../publication-profiles.cjs';
import publicationConfiguration from '../../../../publication-config.cjs';
import { localPath } from '../../../../backend-paths.cjs';
import { updateAvailability } from '../../../../crawler-availability.cjs';
import { listarPendenciasBairroAlugueis, resolverBairroAlugueis, catalogosBairroAlugueis } from './bairros-alugueis.js';
import { listarPendenciasTipoAlugueis, resolverTipoAlugueis, catalogoTiposAlugueis } from './tipos-alugueis.js';
import { listarPendenciasFotoAlugueis, resolverFotoAlugueis, confirmarSemFotoAlugueis, confirmarFotoIndividualAlugueis } from './fotos-alugueis.js';
import { listarPendenciasCidadeAlugueis, resolverCidadeAlugueis } from './cidades-alugueis.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(directory, '../../../../');

export function criarPainelAlugueis({ backendRoot = defaultRoot, spawnProcess = spawn } = {}) {
  const projects = listarProjetosAlugueis(JSON.parse(fs.readFileSync(path.join(backendRoot, 'package.json'), 'utf8')).scripts);
  const configPath = path.join(backendRoot, '_03database/outros/alugueis-scheduler-config.json');
  const defaults = { hour: '21:00', enabled: false, timezone: 'America/Sao_Paulo', selectedScripts: projects.map(project => project.name) };
  let config = defaults;
  if (fs.existsSync(configPath)) config = validarConfiguracaoAlugueis(JSON.parse(fs.readFileSync(configPath, 'utf8')), projects);
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);
  let task;
  let currentProcess;
  let stopRequested = false;
  let closing = false;
  const logs = [];
  const state = { running: false, currentQueue: [], currentIndex: -1, currentProject: null, statuses: {} };
  const projectFor = collection => projects.find(project => project.collection === collection);

  function log(message, type = 'info') {
    const entry = { at: new Date().toISOString(), message: String(message).replace(/\u001b\[[0-9;]*m/g, ''), type };
    logs.push(entry);
    if (logs.length > 800) logs.shift();
    io.emit('scheduler:log', entry);
  }
  function emitState() { io.emit('scheduler:state', state); }
  function readProject(project, removed = false) {
    const filename = `${project.collection}${removed ? 'RetiradosLocacao' : 'Locacao'}.json`;
    const file = path.join(backendRoot, 'crawler', filename);
    if (!fs.existsSync(file)) return [];
    const records = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(records)) throw new Error(`JSON invalido: ${filename}`);
    return removed ? records : records.filter(item => !String(item.dataExclusao || '').trim());
  }
  function summary() {
    const rows = projects.map(project => {
      try { return { ...project, ativos: readProject(project).length, retirados: readProject(project, true).length, error: '' }; }
      catch (error) { return { ...project, ativos: 0, retirados: 0, error: error.message }; }
    });
    return { projects: rows, ativos: rows.reduce((sum, row) => sum + row.ativos, 0), retirados: rows.reduce((sum, row) => sum + row.retirados, 0), errors: rows.filter(row => row.error).length };
  }
  async function runQueue(names, origin = 'manual', publicationJobs = null) {
    if (state.running || closing) throw new Error('Ja existe uma execucao em andamento.');
    const selected = publicationJobs || projects.filter(project => names.includes(project.name));
    if (!selected.length || (!publicationJobs && names.some(name => !projects.some(project => project.name === name)))) throw new Error('Selecione projetos de aluguel validos.');
    state.running = true;
    stopRequested = false;
    state.currentQueue = selected.map(project => project.name);
    state.statuses = Object.fromEntries(selected.map(project => [project.name, 'pending']));
    emitState();
    log(`Rodada de alugueis iniciada (${origin}): ${selected.length} projetos.`);
    try {
      for (const [index, project] of selected.entries()) {
        if (stopRequested) break;
        state.currentIndex = index;
        state.currentProject = project.name;
        state.statuses[project.name] = 'running';
        emitState();
        log(`Iniciando ${project.collection}.`);
        let outputTail = '';
        const code = await new Promise(resolve => {
          try {
            const child = spawnProcess(process.execPath, project.args, { cwd: backendRoot, env: { ...process.env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
            currentProcess = child;
            child.stdout.on('data', data => { outputTail = (outputTail + data.toString()).slice(-16000); log(data.toString()); });
            child.stderr.on('data', data => { outputTail = (outputTail + data.toString()).slice(-16000); log(data.toString(), 'warn'); });
            child.once('error', error => { log(error.message, 'error'); resolve(1); });
            child.once('close', resolve);
          } catch (error) { log(error.message, 'error'); resolve(1); }
        });
        currentProcess = null;
        let effectiveCode = code;
        if (!publicationJobs && !stopRequested) {
          try {
            const availability = await updateAvailability(project.name, { status: code === 0 ? 'completed' : 'failed', outputTail }, {
              file: localPath(backendRoot, 'logs', 'crawler-site-availability.json'),
            });
            if (availability.siteUnavailable) {
              effectiveCode = 1;
              log(availability.publicationError || `${project.collection}: site indisponivel; anuncios suspensos do Typesense.`, availability.publicationError ? 'error' : 'warn');
            }
          } catch (error) {
            effectiveCode = 1;
            log(`Falha ao atualizar disponibilidade: ${error.message}`, 'error');
          }
        }
        state.statuses[project.name] = stopRequested ? 'stopped' : effectiveCode === 0 ? 'success' : 'error';
        emitState();
        log(`${project.collection}: ${state.statuses[project.name]}.`, effectiveCode === 0 && !stopRequested ? 'success' : 'warn');
        io.emit('data:updated');
      }
    } finally {
      state.running = false;
      state.currentProject = null;
      for (const name of state.currentQueue) if (state.statuses[name] === 'pending') state.statuses[name] = 'stopped';
      emitState();
      log(stopRequested ? 'Rodada interrompida.' : 'Rodada concluida.');
    }
  }
  async function stop() {
    stopRequested = true;
    const child = currentProcess;
    if (!child) return;
    if (process.platform === 'win32') {
      await new Promise((resolve, reject) => {
        const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true });
        killer.once('error', reject);
        killer.once('close', code => code === 0 ? resolve() : reject(new Error('Nao foi possivel parar a arvore do crawler.')));
      });
    } else child.kill('SIGTERM');
  }
  function schedule() {
    task?.stop();
    task?.destroy();
    if (!config.enabled) return;
    const [hour, minute] = config.hour.split(':');
    task = cron.schedule(`${Number(minute)} ${Number(hour)} * * *`, () => {
      if (!state.running) runQueue(config.selectedScripts, 'agendamento').catch(error => log(error.message, 'error'));
    }, { timezone: config.timezone });
  }

  app.use(express.json({ limit: '100kb' }));
  app.get('/', (_req, res) => res.sendFile(path.join(directory, 'painelAlugueis.html')));
  app.get('/painel.css', (_req, res) => {
    const dom = new JSDOM(fs.readFileSync(path.join(directory, 'painel.html'), 'utf8'));
    const css = Array.from(dom.window.document.querySelectorAll('style')).map(style => style.textContent).join('\n');
    dom.window.close();
    res.type('css').send(css);
  });
  app.get('/raspagem.png', (_req, res) => res.sendFile(path.join(directory, 'raspagem.png')));
  app.get('/api/config', (_req, res) => res.json({ config, projects, state }));
  app.get('/api/summary', (_req, res) => res.json(summary()));
  const allActiveRecords = () => projects.flatMap(project => readProject(project).map(item => ({ ...item, imobiliaria:project.collection })));
  app.get('/api/city-json-issues', (_req, res) => {
    try { res.json(listarPendenciasCidadeAlugueis(backendRoot, projects)); }
    catch (error) { res.status(400).json({ error: error.message }); }
  });
  app.post('/api/city-json-issues/resolve', (req, res) => {
    try {
      if (state.running) return res.status(409).json({ error: 'Aguarde o fim da execucao antes de corrigir o JSON.' });
      const result = resolverCidadeAlugueis(backendRoot, projects, req.body);
      log(`[CIDADES-JSON] ${result.file}: cidade corrigida para '${result.cidade}'.`, 'success');
      io.emit('data:updated');
      res.json(result);
    } catch (error) { res.status(400).json({ error: error.message }); }
  });
  app.get('/api/linkfoto-json-issues', (_req,res) => {
    try {res.json(listarPendenciasFotoAlugueis(backendRoot,projects));}
    catch(error) {res.status(400).json({error:error.message});}
  });
  app.post('/api/linkfoto-json-issues/resolve', (req,res) => {
    try {
      if (state.running) return res.status(409).json({error:'Aguarde o fim da execucao antes de corrigir o JSON.'});
      const result=resolverFotoAlugueis(backendRoot,projects,req.body);
      log(`[LINKFOTO-JSON] ${result.file}: link da foto corrigido.`,'success');
      io.emit('data:updated');
      res.json(result);
    } catch(error) {res.status(400).json({error:error.message});}
  });
  app.post('/api/linkfoto-json-issues/confirm', (req,res) => {
    try {
      if (state.running) return res.status(409).json({error:'Aguarde o fim da execucao antes de confirmar o registro.'});
      if (req.body.confirmacao!==true) throw new Error('Confirme explicitamente o registro revisado.');
      const result=confirmarFotoIndividualAlugueis(backendRoot,projects,req.body);
      log(`[LINKFOTO-JSON] ${result.file || req.body.file}: registro confirmado individualmente.`,'success');
      res.json(result);
    } catch(error) {res.status(400).json({error:error.message});}
  });
  app.post('/api/linkfoto-json-issues/confirm-all', (req,res) => {
    try {
      if (state.running) return res.status(409).json({error:'Aguarde o fim da execucao antes de confirmar as pendencias.'});
      if (req.body.confirmacao!==true) throw new Error('Confirme explicitamente os registros sem foto.');
      const result=confirmarSemFotoAlugueis(backendRoot,projects);
      log(`[LINKFOTO-JSON] ${result.confirmed} registro(s) confirmado(s) sem foto.`,'success');
      res.json(result);
    } catch(error) {res.status(400).json({error:error.message});}
  });
  app.get('/api/bairro-json-issues', (req,res) => {
    try {
      const offset = Math.max(0,Number.parseInt(req.query.offset,10) || 0);
      const limit = Math.min(200,Math.max(1,Number.parseInt(req.query.limit,10) || 100));
      res.json(listarPendenciasBairroAlugueis(backendRoot,projects,offset,limit));
    } catch(error) { res.status(400).json({error:error.message}); }
  });
  app.get('/api/tipo-imovel-json-issues', (_req,res) => {
    try {
      res.json(listarPendenciasTipoAlugueis(backendRoot,projects));
    } catch(error) { res.status(400).json({error:error.message}); }
  });
  app.post('/api/tipo-imovel-json-issues/resolve', (req,res) => {
    try {
      if (state.running) return res.status(409).json({error:'Aguarde o fim da execucao antes de corrigir o JSON.'});
      const result=resolverTipoAlugueis(backendRoot,projects,req.body);
      log(`[TIPO-IMOVEL-JSON] ${result.file}: tipo corrigido para '${result.tipoImovel}'.`,'success');
      io.emit('data:updated');
      res.json(result);
    } catch(error) {res.status(400).json({error:error.message});}
  });
  app.post('/api/bairro-json-issues/resolve', (req,res) => {
    try {
      if (state.running) return res.status(409).json({error:'Aguarde o fim da execucao antes de corrigir o JSON.'});
      const result = resolverBairroAlugueis(backendRoot,projects,req.body);
      log(`[BAIRROS-JSON] ${result.file}: bairro corrigido para '${result.bairro}' (cidade ${result.cidade}).`,'success');
      io.emit('data:updated');
      res.json(result);
    } catch(error) { res.status(400).json({error:error.message}); }
  });
  app.get('/api/validacoes', (req,res) => {
    try {
      const root = path.join(backendRoot,'_03database/filtros');
      const bairroCatalogos = catalogosBairroAlugueis(backendRoot);
      const catalogos = { cidades:bairroCatalogos.cidades, bairros:bairroCatalogos.bairros, tipos:catalogoTiposAlugueis(backendRoot).typeOptions.map(item=>item.slug) };
      const records = allActiveRecords();
      res.json({ total:records.length,issues:validarRegistrosAlugueis(records,req.query.campo,catalogos) });
    } catch(error) { res.status(400).json({error:error.message}); }
  });
  app.get('/api/filtros', (req,res) => {
    try { const records = allActiveRecords(); res.json({total:records.length,rows:filtrosRegistrosAlugueis(records,req.query.campo)}); }
    catch(error) { res.status(400).json({error:error.message}); }
  });
  app.get('/api/duplicados', (_req,res) => {
    try { const records = allActiveRecords(); res.json({total:records.length,groups:duplicadosRegistrosAlugueis(records)}); }
    catch(error) { res.status(500).json({error:error.message}); }
  });
  app.get('/api/publicacao', (_req, res) => {
    const profile = publicationProfiles.publicationProfile('alugueis');
    const data = summary();
    const env = publicationConfiguration.publicationEnvironment(backendRoot);
    res.json({ profile, ativos: data.ativos, projetos: data.projects.length, typesense: publicationConfiguration.typesenseConfigurationStatus(env) });
  });
  app.post('/api/publicacao', (req, res) => {
    try {
      if (state.running) return res.status(409).json({ error: 'Ja existe uma execucao em andamento.' });
      const stage = req.body.etapa;
      if (!['firestore', 'typesense', 'completo'].includes(stage)) throw new Error('Etapa de publicacao invalida.');
      const source = req.body.origem ?? 'firestore';
      if (!['firestore', 'json'].includes(source)) throw new Error('Origem de publicacao invalida.');
      if (source === 'json' && stage !== 'typesense') throw new Error('Origem JSON direto disponivel somente para Typesense.');
      const dryRun = req.body.simulacao === true;
      const publicationEnv = publicationConfiguration.publicationEnvironment(backendRoot);
      publicationConfiguration.validatePublicationConfiguration(publicationProfiles.publicationProfile('alugueis'), stage, dryRun, publicationEnv);
      if (!dryRun && req.body.confirmacao !== true) throw new Error('Confirme explicitamente o envio para os destinos de aluguel.');
      const selectedNames = stage === 'typesense' ? [] : validarConfiguracaoAlugueis({ ...config, selectedScripts: req.body.selectedScripts }, projects).selectedScripts;
      if (stage !== 'typesense' && !selectedNames.length) throw new Error('Selecione imobiliarias na aba Raspagem.');
      const collections = projects.filter(project => selectedNames.includes(project.name)).map(project => project.collection);
      const args = source === 'json'
        ? ['_02utils/typesense/migrateImoveisToTypesense.cjs', '--tipo=alugueis', '--origem=json', ...(dryRun ? ['--dry-run'] : [])]
        : ['publicar-imoveis.js', '--tipo=alugueis', `--etapa=${stage}`, ...collections, ...(dryRun ? ['--dry-run'] : [])];
      runQueue([], dryRun ? 'previa de publicacao' : 'publicacao confirmada', [{ name: `publicacao:${stage}${source === 'json' ? ':json' : ''}`, collection: source === 'json' ? 'JSON → Typesense de alugueis' : 'Publicacao de alugueis', args }]).catch(error => log(error.message, 'error'));
      res.json({ started: true, simulacao: dryRun, perfil: 'alugueis', origem: source });
    } catch (error) { res.status(400).json({ error: error.message }); }
  });
  app.get('/api/imoveis', (req, res) => {
    try {
      const project = projectFor(req.query.projeto);
      if (!project) return res.status(400).json({ error: 'Projeto de aluguel invalido.' });
      const removed = req.query.tipo === 'retirados';
      const query = String(req.query.busca || '').toLowerCase();
      const records = readProject(project, removed).filter(item => !query || [item.titulo, item.codigoBase, item.bairro, item.cidade, item.localizacao].some(value => String(value || '').toLowerCase().includes(query)));
      const pageNumber = Math.max(1, Number.parseInt(req.query.pagina, 10) || 1);
      res.json({ records: records.slice((pageNumber - 1) * 50, pageNumber * 50), total: records.length, pagina: pageNumber, paginas: Math.max(1, Math.ceil(records.length / 50)) });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });
  app.post('/api/config', (req, res) => {
    try {
      const next = validarConfiguracaoAlugueis(req.body, projects);
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(next, null, 2), 'utf8');
      config = next;
      schedule();
      res.json({ config });
    } catch (error) { res.status(400).json({ error: error.message }); }
  });
  app.post('/api/run-now', (req, res) => {
    try {
      if (state.running) return res.status(409).json({ error: 'Ja existe uma execucao em andamento.' });
      const selected = validarConfiguracaoAlugueis({ ...config, selectedScripts: req.body.selectedScripts }, projects).selectedScripts;
      if (!selected.length) throw new Error('Selecione pelo menos um projeto.');
      runQueue(selected).catch(error => log(error.message, 'error'));
      res.json({ started: true });
    } catch (error) { res.status(400).json({ error: error.message }); }
  });
  app.post('/api/stop', async (_req, res) => {
    try { await stop(); log('Parada solicitada.', 'warn'); res.json({ stopped: true }); }
    catch (error) { res.status(500).json({ error: error.message }); }
  });
  app.post('/api/logs/clear', (_req, res) => { logs.length = 0; io.emit('logs:cleared'); res.json({ cleared: true }); });
  io.on('connection', socket => { socket.emit('scheduler:state', state); socket.emit('scheduler:history', logs); });
  schedule();
  return { app, server, runQueue, state, projects, close: async () => { closing = true; task?.stop(); task?.destroy(); await stop(); io.close(); } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const panel = criarPainelAlugueis();
  let port = Number(process.env.ALUGUEIS_PORT || 3106);
  const start = () => panel.server.listen(port, '127.0.0.1');
  panel.server.on('error', error => {
    if (error.code === 'EADDRINUSE' && port < 3200) { port++; start(); }
    else { console.error(error.message); process.exitCode = 1; }
  });
  panel.server.once('listening', () => {
    const url = `http://127.0.0.1:${port}`;
    console.log(`Painel de alugueis: ${url}`);
    if (process.env.ALUGUEIS_OPEN_BROWSER !== 'false') open(url).catch(error => console.warn(error.message));
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { panel.close().then(() => process.exit(0)).catch(error => { console.error(error.message); process.exit(1); }); });
  start();
}