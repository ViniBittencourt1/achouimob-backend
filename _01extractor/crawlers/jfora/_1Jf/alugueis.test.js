import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { JSDOM } from 'jsdom';
import { test } from 'node:test';
import { listarProjetosAlugueis, validarConfiguracaoAlugueis, validarRegistrosAlugueis, filtrosRegistrosAlugueis, duplicadosRegistrosAlugueis } from './alugueis-model.js';
import { criarPainelAlugueis } from './alugueis.js';
import { ORDEM_PROJETOS, ordenarProjetos, ordenarScripts } from '../../../../crawler-order.cjs';
import { montarProjetosCombinados } from '../_utils/projetosCombinados.js';

const pkg = JSON.parse(fs.readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8'));
const projects = listarProjetosAlugueis(pkg.scripts);

test('painel de aluguel lista exatamente as 124 rotas individuais sem vendas ou agregadores', () => {
  assert.equal(projects.length, 124);
  assert.equal(new Set(projects.map(project => project.collection)).size, 124);
  assert.ok(projects.every(project => project.name.endsWith(':locacao')));
  assert.equal(projects.find(project => project.name === 'rv:locacao').collection, 'jfRVNegocios');
  assert.equal(projects.find(project => project.name === 'oliveira:locacao').collection, 'jfOliveira');
  assert.equal(projects.find(project => project.name === 'nitremax:locacao').collection, 'nitRemax');
  assert.equal(projects.find(project => project.name === 'remax:locacao').collection, 'jfRemax');
  assert.ok(!projects.some(project => project.name === 'locacao:kenlo' || project.name === 'locacao:niteroi'));
  assert.deepEqual(projects.map(project => project.collection), ORDEM_PROJETOS.filter(collection => projects.some(project => project.collection === collection)));
});

test('configuracao rejeita vendas, injecao de comandos, horarios invalidos e conserva modo independente', () => {
  const valid = { enabled: true, hour: '21:30', selectedScripts: ['crispi:locacao'] };
  assert.equal(validarConfiguracaoAlugueis(valid, projects).timezone, 'America/Sao_Paulo');
  for (const name of ['crispi', 'typesense:sync', 'crispi:locacao;echo teste']) assert.throws(() => validarConfiguracaoAlugueis({ ...valid, selectedScripts: [name] }, projects), /somente projetos/);
  assert.throws(() => validarConfiguracaoAlugueis({ ...valid, hour: '25:00' }, projects), /Horario/);
});

test('painel de vendas agrupa venda e aluguel de cada imobiliaria em um unico projeto', () => {
  const source = fs.readFileSync(new URL('./jfora.js', import.meta.url), 'utf8');
  const start = source.indexOf('function extractJforaScripts()');
  const end = source.indexOf('function getCollectionNameForScript', start);
  const context = vm.createContext({ loadPackageJson: () => pkg, montarProjetosCombinados });
  vm.runInContext(source.slice(start, end), context);
  const sales = vm.runInContext('extractJforaScripts()', context);
  const crispi = sales.find(project => project.name === 'crispi');
  assert.deepEqual([crispi.venda, crispi.aluguel], ['crispi', 'crispi:locacao']);
  assert.ok(!sales.some(project => project.name.startsWith('locacao:')));
  assert.deepEqual(sales.filter(project => project.name.endsWith(':locacao')).map(project => project.name), ['nitgrupo:locacao', 'nitselfspin:locacao', 'rioapsa:locacao']);
  const jf = ORDEM_PROJETOS.filter(collection => collection.startsWith('jf')).map(collection => collection.slice(2).toLowerCase().replace('rvnegocios', 'rv'));
  assert.deepEqual(Array.from(sales, project => project.name).filter(name => jf.includes(name)), jf);
});

test('configuracao de vendas carrega e salva a mesma ordem de aluguel sem mudar horario ou selecao', () => {
  const source = fs.readFileSync(new URL('./jfora.js', import.meta.url), 'utf8');
  const selectedScripts = ['mega', 'rv', 'select', '1000imoveis', 'universal'];
  const expected = ['1000imoveis', 'universal', 'select', 'rv', 'mega'];
  const context = vm.createContext({
    fs: { existsSync: () => true, readFileSync: () => JSON.stringify({ hour: '08:58', selectedScripts }) },
    configPath: 'config', ordenarScripts,
  });
  const start = source.indexOf('function loadConfig(');
  const end = source.indexOf('function saveConfig(', start);
  vm.runInContext(source.slice(start, end), context);
  const loaded = vm.runInContext('loadConfig([])', context);
  assert.equal(loaded.hour, '08:58');
  assert.deepEqual(Array.from(loaded.selectedScripts), expected);

  let handler;
  let saved;
  const apiContext = vm.createContext({
    app: { post: (_route, callback) => { handler = callback; } },
    extractJforaScripts: () => selectedScripts.map(name => ({ name })),
    ordenarScripts, parseHour: () => true,
    saveConfig: config => { saved = config; }, scheduleDailyRun: () => {},
  });
  const apiStart = source.indexOf('app.post("/api/config"');
  const apiEnd = source.indexOf('app.post("/api/run-now"', apiStart);
  vm.runInContext(source.slice(apiStart, apiEnd), apiContext);
  handler({ body: { hour: '08:58', selectedScripts } }, { json: () => {} });
  assert.equal(saved.hour, '08:58');
  assert.deepEqual(Array.from(saved.selectedScripts), expected);
});

test('agenda de vendas so roda aluguel junto do projeto, nunca comando de aluguel avulso', async () => {
  const source = fs.readFileSync(new URL('./jfora.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function runQueue(');
  const end = source.indexOf('  running = true;', start);
  const context = vm.createContext({ running: false, emitLog: () => {}, loadPackageJson: () => pkg, ordenarScripts, extractJforaScripts: () => montarProjetosCombinados(pkg.scripts), expandirEtapas: (names) => names });
  vm.runInContext(`${source.slice(start, end)}return selectedScripts;}`, context);
  assert.equal(await vm.runInContext("runQueue(['crispi:locacao','locacao:kenlo'])", context), undefined);
  assert.deepEqual(Array.from(await vm.runInContext("runQueue(['nitgrupo:locacao'])", context)), ['nitgrupo:locacao']);
  const valid = await vm.runInContext("runQueue(['crispi','crispi:locacao','locacao:padrao'])", context);
  assert.deepEqual(Array.from(valid), ['crispi']);
  const blocked = await vm.runInContext("runQueue(['publicar:alugueis','firestore:publish:alugueis','typesense:sync:alugueis','alugueis','crispi;echo teste'])", context);
  assert.equal(blocked, undefined);
  const ordered = await vm.runInContext("runQueue(['mega','rv','select','1000imoveis','universal','crispi'])", context);
  assert.deepEqual(Array.from(ordered), ['1000imoveis', 'universal', 'select', 'rv', 'crispi', 'mega']);
});

test('painel conserva horario vazio e desativa cron sem impedir a execucao manual', async () => {
  const source = fs.readFileSync(new URL('./jfora.js', import.meta.url), 'utf8');
  const logs = [];
  const calls = [];
  const context = vm.createContext({
    fs: { existsSync: () => true, readFileSync: () => JSON.stringify({ hour: '', selectedScripts: ['fontes'] }) },
    configPath: 'config', ordenarScripts,
    cronTask: { stop: () => calls.push('stop') },
    cron: { schedule: (...args) => { calls.push(args); return { stop: () => calls.push('stop') }; } },
    emitLog: message => logs.push(message),
    runQueue: async (...args) => calls.push(args),
  });
  vm.runInContext(source.slice(source.indexOf('function loadConfig('), source.indexOf('function saveConfig(')), context);
  vm.runInContext(source.slice(source.indexOf('function parseHour('), source.indexOf('function emitState(')), context);
  vm.runInContext(source.slice(source.indexOf('function scheduleDailyRun('), source.indexOf('async function runQueue(')), context);
  assert.equal(vm.runInContext('loadConfig([]).hour', context), '');
  vm.runInContext('scheduleDailyRun(loadConfig([]))', context);
  assert.deepEqual(calls, ['stop']);
  assert.ok(logs.some(message => message.includes('desativado')));
  vm.runInContext('scheduleDailyRun({ hour: "08:58", timezone: "America/Sao_Paulo", selectedScripts: ["fontes"] })', context);
  assert.equal(calls[1][0], '58 8 * * *');
  await calls[1][1]();
  assert.deepEqual(Array.from(calls[2][0]), ['fontes']);
  assert.equal(calls[2][1], 'agendado');
});

test('API aceita remover horario, persiste desativacao e rejeita horario invalido', () => {
  const source = fs.readFileSync(new URL('./jfora.js', import.meta.url), 'utf8');
  let handler;
  let saved;
  let scheduled;
  let status;
  const context = vm.createContext({
    app: { post: (_route, callback) => { handler = callback; } },
    extractJforaScripts: () => [{ name: 'fontes' }], ordenarScripts,
    saveConfig: config => { saved = config; },
    scheduleDailyRun: config => { scheduled = config; },
  });
  vm.runInContext(source.slice(source.indexOf('function parseHour('), source.indexOf('function emitState(')), context);
  vm.runInContext(source.slice(source.indexOf('app.post("/api/config"'), source.indexOf('app.post("/api/run-now"')), context);
  const response = { json: value => value, status: code => { status = code; return response; } };
  handler({ body: { hour: '', selectedScripts: ['fontes'] } }, response);
  assert.equal(saved.hour, '');
  assert.equal(scheduled.hour, '');
  saved = undefined;
  handler({ body: { hour: '25:00', selectedScripts: ['fontes'] } }, response);
  assert.equal(status, 400);
  assert.equal(saved, undefined);
});

test('botao Sem agendamento limpa horario sem executar nem salvar automaticamente', () => {
  const html = fs.readFileSync(new URL('./painel.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html);
  const button = dom.window.document.getElementById('btnNoSchedule');
  const input = dom.window.document.getElementById('hourInput');
  input.value = '08:58';
  const start = html.indexOf('    btnNoSchedule.addEventListener(');
  const end = html.indexOf('    btnSave.addEventListener(', start);
  vm.runInNewContext(html.slice(start, end), { btnNoSchedule: button, hourInput: input, appendLog: () => {} });
  button.click();
  assert.equal(input.value, '');
  dom.window.close();
});

test('abas principais e validacoes seguem a mesma sequencia do painel de vendas', () => {
  const html = new JSDOM(fs.readFileSync(new URL('./painelAlugueis.html',import.meta.url),'utf8'));
  const sales = new JSDOM(fs.readFileSync(new URL('./painel.html',import.meta.url),'utf8'));
  assert.deepEqual([...html.window.document.querySelectorAll('[data-tab]')].slice(0,6).map(button=>button.dataset.tab),[...sales.window.document.querySelectorAll('.tab-bar [data-tab]')].map(button=>button.dataset.tab));
  const tabs = [...html.window.document.querySelectorAll('[data-json]')].slice(0,9).map(button=>button.dataset.json);
  assert.deepEqual(tabs,['cidades','bairros','titulo','localizacao','tipoImovel','preco','linkFoto','linkReal','resumo']);
  assert.ok(html.window.document.getElementById('bairroJsonIssues'));
  assert.ok(html.window.document.getElementById('btnCheckBairroJson'));
  assert.ok(html.window.document.getElementById('tipoImovelJsonIssues'));
  assert.ok(html.window.document.getElementById('btnCheckTipoImovelJson'));
  assert.ok(html.window.document.getElementById('linkFotoJsonIssues'));
  assert.ok(html.window.document.getElementById('btnCheckLinkFotoJson'));
  assert.ok(html.window.document.getElementById('btnConfirmAllLinkFotoJson'));
  assert.equal(html.window.document.getElementById('btnPublishJson').textContent.trim(),'Transmitir JSONs para o Firestore');
  assert.ok(html.window.document.getElementById('jsonTransferActions'));
  assert.ok(html.window.document.querySelector('script:not([src])').textContent.includes("publish(false,'firestore','jsonPublishMessage')"));
  assert.ok(html.window.document.querySelector('script:not([src])').textContent.includes('btn-confirm-linkfoto'));
  const rentalSource=fs.readFileSync(new URL('./painelAlugueis.html',import.meta.url),'utf8');
  for (const label of ['Opção 1: atribuir bairro já existente','Opção 2: criar novo bairro e aplicar','Cidade do registro','Bairro atual:','LinkReal:','Criar e aplicar']) assert.ok(rentalSource.includes(label));
  for (const script of html.window.document.querySelectorAll('script:not([src])')) new vm.Script(script.textContent);
  html.window.close(); sales.window.close();
});

test('validacao, filtros e duplicados usam campos de aluguel sem considerar Sob consulta um erro', () => {
  const record = { imobiliaria:'jfTeste',codigoBase:'1',linkReal:'https://example.com/1',preco:null,cidade:'juiz-de-fora-mg',bairro:'centro',tipoImovel:'apartamento',titulo:'Apartamento' };
  const catalogs = {cidades:[{slug:record.cidade}],bairros:[{slug:record.bairro,cidade:record.cidade}],tipos:['apartamento']};
  assert.equal(validarRegistrosAlugueis([record],'preco',catalogs).length,0);
  assert.equal(validarRegistrosAlugueis([record],'cidades',catalogs).length,0);
  assert.equal(validarRegistrosAlugueis([{...record,linkReal:'javascript:teste'}],'linkReal',catalogs).length,1);
  assert.equal(filtrosRegistrosAlugueis([record,record],'bairro')[0].quantidade,2);
  assert.ok(duplicadosRegistrosAlugueis([record,{...record,linkReal:'https://example.com/1?from=rent'}]).some(group=>group.tipo==='Link repetido'));
  assert.throws(()=>validarRegistrosAlugueis([record],'campoInvalido',catalogs),/invalido/);
});

test('APIs e fila do painel ficam isoladas de vendas e executam apenas rotas de aluguel', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'painel-alugueis-'));
  fs.mkdirSync(path.join(root, 'crawler'));
  const catalogs = path.join(root,'_03database/filtros');
  fs.mkdirSync(catalogs,{recursive:true});
  fs.writeFileSync(path.join(catalogs,'_brCidades.json'),JSON.stringify([{slug:'juiz-de-fora-mg'}]));
  fs.writeFileSync(path.join(catalogs,'_jfBairros.json'),JSON.stringify([{slug:'centro',cidade:'juiz-de-fora-mg'}]));
  fs.writeFileSync(path.join(catalogs,'_brTipoImovel.json'),JSON.stringify({tiposFiltro:{residencial:[{slug:'apartamento'}]}}));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkg));
  fs.writeFileSync(path.join(root, 'crawler/jfCrispi.json'), JSON.stringify([{ titulo: 'VENDA', preco: 300000 }]));
  fs.writeFileSync(path.join(root, 'crawler/jfCrispiLocacao.json'), JSON.stringify([{ titulo: 'ALUGUEL', preco: 850 }]));
  fs.writeFileSync(path.join(root, 'crawler/jfCrispiRetiradosLocacao.json'), JSON.stringify([{ titulo: 'RETIRADO', preco: 700, imobiliaria: 'jfCrispi' }]));
  const executions = [];
  const panel = criarPainelAlugueis({ backendRoot: root, spawnProcess: (command, args, options) => {
    executions.push({ command, args, cwd: options.cwd });
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    setImmediate(() => { child.stdout.write('Crawler simulado'); child.emit('close', 0); });
    return child;
  } });
  try {
    await new Promise(resolve => panel.server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${panel.server.address().port}`;
    const active = await (await fetch(`${base}/api/imoveis?projeto=jfCrispi`)).json();
    assert.equal(active.records[0].titulo, 'ALUGUEL');
    const removed = await (await fetch(`${base}/api/imoveis?projeto=jfCrispi&tipo=retirados`)).json();
    assert.equal(removed.records[0].titulo, 'RETIRADO');
    assert.equal((await fetch(`${base}/api/imoveis?projeto=../../credentials`)).status, 400);
    const summary = await (await fetch(`${base}/api/summary`)).json();
    assert.equal(summary.ativos, 1);
    assert.equal(summary.retirados, 1);
    const validation = await (await fetch(`${base}/api/validacoes?campo=preco`)).json();
    assert.equal(validation.total,1);
    assert.equal(validation.issues.length,0);
    const filters = await (await fetch(`${base}/api/filtros?campo=tipoImovel`)).json();
    assert.equal(filters.total,1);
    assert.equal(filters.rows.length,1);
    const duplicates = await (await fetch(`${base}/api/duplicados`)).json();
    assert.equal(duplicates.total,1);
    assert.equal(duplicates.groups.length,0);
    const bairroIssues = await (await fetch(`${base}/api/bairro-json-issues`)).json();
    assert.equal(bairroIssues.total,1);
    assert.equal(bairroIssues.issues[0].file,'jfCrispiLocacao.json');
    const correctionBody = {file:'jfCrispiLocacao.json',linkReal:'https://example.com/aluguel',mode:'assign',targetSlug:'centro',targetCidade:'juiz-de-fora-mg'};
    const rentalRecords = [{titulo:'ALUGUEL',preco:850,linkReal:correctionBody.linkReal}];
    fs.writeFileSync(path.join(root,'crawler/jfCrispiLocacao.json'),JSON.stringify(rentalRecords));
    const correction = await fetch(`${base}/api/bairro-json-issues/resolve`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(correctionBody)});
    assert.equal(correction.status,200);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root,'crawler/jfCrispiLocacao.json'),'utf8'))[0].bairro,'centro');
    assert.equal((await fetch(`${base}/api/bairro-json-issues/resolve`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...correctionBody,file:'jfCrispi.json'})})).status,400);
    const types=await (await fetch(`${base}/api/tipo-imovel-json-issues`)).json();
    assert.equal(types.total,1);
    const typeBody={file:'jfCrispiLocacao.json',linkReal:correctionBody.linkReal,tipoImovel:'apartamento'};
    assert.equal((await fetch(`${base}/api/tipo-imovel-json-issues/resolve`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(typeBody)})).status,200);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root,'crawler/jfCrispiLocacao.json'),'utf8'))[0].tipoImovel,'apartamento');
    assert.equal((await fetch(`${base}/api/tipo-imovel-json-issues/resolve`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...typeBody,file:'jfCrispi.json'})})).status,400);
    const photos=await (await fetch(`${base}/api/linkfoto-json-issues`)).json();
    assert.equal(photos.total,1);
    const singleBody={file:'jfCrispiLocacao.json',linkReal:correctionBody.linkReal,linkFotoAtual:''};
    const beforeConfirmation=fs.readFileSync(path.join(root,'crawler/jfCrispiLocacao.json'),'utf8');
    assert.equal((await fetch(`${base}/api/linkfoto-json-issues/confirm`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(singleBody)})).status,400);
    const confirmed=await fetch(`${base}/api/linkfoto-json-issues/confirm`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...singleBody,confirmacao:true})});
    assert.equal(confirmed.status,200);
    assert.equal((await (await fetch(`${base}/api/linkfoto-json-issues`)).json()).total,0);
    assert.equal(fs.readFileSync(path.join(root,'crawler/jfCrispiLocacao.json'),'utf8'),beforeConfirmation);
    assert.equal((await fetch(`${base}/api/linkfoto-json-issues/confirm`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...singleBody,confirmacao:true,file:'jfCrispi.json'})})).status,400);
    assert.equal((await fetch(`${base}/api/linkfoto-json-issues/confirm-all`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,400);
    const photoBody={file:'jfCrispiLocacao.json',linkReal:correctionBody.linkReal,linkFoto:'https://example.com/foto.jpg'};
    assert.equal((await fetch(`${base}/api/linkfoto-json-issues/resolve`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(photoBody)})).status,200);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root,'crawler/jfCrispiLocacao.json'),'utf8'))[0].linkFoto,photoBody.linkFoto);
    assert.equal((await fetch(`${base}/api/linkfoto-json-issues/resolve`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...photoBody,file:'jfCrispi.json'})})).status,400);
    assert.equal((await (await fetch(`${base}/api/linkfoto-json-issues`)).json()).total,0);
    assert.equal((await fetch(`${base}/api/validacoes?campo=campoInvalido`)).status,400);
    const initial = await (await fetch(`${base}/api/config`)).json();
    assert.equal(initial.config.enabled, false);
    assert.equal((await fetch(`${base}/api/run-now`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selectedScripts: ['crispi'] }) })).status, 400);
    assert.equal(executions.length, 0);
    await assert.rejects(panel.runQueue(['typesense:sync']), /validos/);
    await panel.runQueue(['start:locacao', 'crispi:locacao']);
    assert.equal(executions.length, 2);
    assert.ok(executions[0].args.join(' ').includes('crispi'));
    assert.ok(executions[1].args.join(' ').includes('start'));
    assert.ok(executions.every(execution => execution.args.join(' ').includes('locacao')));
    assert.equal(panel.state.running, false);
    assert.equal(fs.readFileSync(path.join(root, 'crawler/jfCrispi.json'), 'utf8'), JSON.stringify([{ titulo: 'VENDA', preco: 300000 }]));
    const saved = await fetch(`${base}/api/config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hour: '20:30', enabled: false, selectedScripts: ['crispi:locacao'] }) });
    assert.equal(saved.status, 200);
    const publication = await (await fetch(`${base}/api/publicacao`)).json();
    assert.equal(publication.profile.firestore, '__alugueisPublicos');
    assert.equal(publication.profile.typesense, 'imoveis_alugueis');
    assert.equal(typeof publication.typesense.configured,'boolean');
    if (!publication.typesense.configured) {
      const noKey=await fetch(`${base}/api/publicacao`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({etapa:'typesense',confirmacao:true})});
      assert.equal(noKey.status,400);
      assert.ok((await noKey.json()).error.includes('Typesense nao configurado'));
      assert.equal(executions.length,2);
    }
    const unconfirmed = await fetch(`${base}/api/publicacao`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ etapa: 'firestore', simulacao: false, selectedScripts: ['crispi:locacao'] }) });
    assert.equal(unconfirmed.status, 400);
    assert.equal(executions.length, 2);
    const preview = await fetch(`${base}/api/publicacao`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ etapa: 'firestore', simulacao: true, selectedScripts: ['crispi:locacao'], tipo: 'vendas' }) });
    assert.equal(preview.status, 200);
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(executions[2].args.includes('--tipo=alugueis'));
    assert.ok(executions[2].args.includes('--dry-run'));
    assert.ok(!executions[2].args.includes('--tipo=vendas'));
    assert.ok(fs.existsSync(path.join(root, '_03database/outros/alugueis-scheduler-config.json')));
    assert.ok(!fs.existsSync(path.join(root, 'site-scheduler-config.json')));
    assert.equal((await fetch(`${base}/api/publish-json`, { method: 'POST' })).status, 404);
  } finally { await panel.close(); fs.rmSync(root, { recursive: true, force: true }); }
});

test('envio direto JSON para Typesense fixa perfil de aluguel e preserva envio anterior', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'typesense-alugueis-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: {} }));
  const executions = [];
  const panel = criarPainelAlugueis({ backendRoot: root, spawnProcess: (_command, args) => {
    executions.push(args);
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    setImmediate(() => child.emit('close', 0));
    return child;
  } });
  try {
    await new Promise(resolve => panel.server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${panel.server.address().port}`;
    const send = body => fetch(`${base}/api/publicacao`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    for (const body of [
      { etapa: 'typesense', origem: 'invalida', simulacao: true },
      { etapa: 'firestore', origem: 'json', simulacao: true },
      { etapa: 'completo', origem: 'json', simulacao: true },
      { etapa: 'typesense', origem: 'json', confirmacao: false },
    ]) assert.equal((await send(body)).status, 400);
    assert.equal(executions.length, 0);
    panel.state.running = true;
    assert.equal((await send({ etapa: 'typesense', origem: 'json', simulacao: true })).status, 409);
    panel.state.running = false;
    const response = await send({ etapa: 'typesense', origem: 'json', simulacao: true, tipo: 'vendas', selectedScripts: ['vendas'] });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).origem, 'json');
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(executions[0], ['_02utils/typesense/migrateImoveisToTypesense.cjs', '--tipo=alugueis', '--origem=json', '--dry-run']);
    assert.equal((await send({ etapa: 'typesense', simulacao: true })).status, 200);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(executions[1], ['publicar-imoveis.js', '--tipo=alugueis', '--etapa=typesense', '--dry-run']);
  } finally { await panel.close(); fs.rmSync(root, { recursive: true, force: true }); }
});

test('tela Typesense permite escolher JSON, exige confirmacao e mostra falhas de inicio', async () => {
  const dom = new JSDOM(fs.readFileSync(new URL('./painelAlugueis.html', import.meta.url), 'utf8'), { runScripts: 'outside-only' });
  const { window } = dom;
  const requests = [];
  let confirmed = false;
  let fail = false;
  window.io = () => ({ on() {} });
  window.confirm = () => confirmed;
  window.fetch = async (url, options) => {
    if (url === '/api/config') return { ok: true, json: async () => ({ projects: [], config: { hour: '20:00', enabled: false, selectedScripts: [] }, state: { running: false } }) };
    if (url === '/api/publicacao' && options?.method === 'POST') {
      requests.push(JSON.parse(options.body));
      return { ok: !fail, json: async () => fail ? { error: 'Ja existe uma execucao em andamento.' } : { started: true } };
    }
    return { ok: true, json: async () => ({ profile: { firestore: '__alugueisPublicos', typesense: 'imoveis_alugueis', filtrosPrefix: 'filtros_alugueis_' }, ativos: 0 }) };
  };
  try {
    window.eval(window.document.querySelector('script:not([src])').textContent);
    await new Promise(resolve => setImmediate(resolve));
    const doc = window.document;
    doc.querySelector('[data-tab="typesense"]').click();
    const source = doc.getElementById('typesenseSource');
    source.value = 'json';
    source.dispatchEvent(new window.Event('change'));
    assert.equal(doc.getElementById('typesenseSourceControls').hidden, false);
    assert.equal(doc.getElementById('publicationStageLabel').textContent, 'JSON local → imoveis_alugueis');
    await doc.getElementById('publishPublication').onclick();
    assert.equal(requests.length, 0);
    confirmed = true;
    fail = true;
    await doc.getElementById('publishPublication').onclick();
    assert.equal(requests[0].origem, 'json');
    assert.equal(requests[0].confirmacao, true);
    assert.equal(requests[0].selectedScripts.length, 0);
    assert.match(doc.getElementById('publicationMessage').textContent, /execucao em andamento/);
    assert.equal(doc.getElementById('publishPublication').disabled, false);
    fail = false;
    await doc.getElementById('previewPublication').onclick();
    assert.equal(requests[1].simulacao, true);
    assert.equal(requests[1].origem, 'json');
    doc.querySelector('[data-tab="firestore"]').click();
    assert.equal(doc.getElementById('typesenseSourceControls').hidden, true);
    assert.equal(doc.getElementById('publicationStageLabel').textContent, 'JSON → __alugueisPublicos');
    await new Promise(resolve => setImmediate(resolve));
  } finally { window.close(); }
});