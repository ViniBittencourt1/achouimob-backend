import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { separarVendas, salvarHistoricoVendas, publicarRetiradosVendas, linhaRetiradoVendas } from './_01extractor/crawlers/jfora/_utils/vendasSincronizacao.js';

const backendRoot = path.dirname(fileURLToPath(import.meta.url));
const { publicationEnvironment } = createRequire(import.meta.url)('./publication-config.cjs');
const hash = value => createHash('sha256').update(value).digest('hex');
const quote = title => `'${title.replace(/'/g, "''")}'`;

export function descobrirProjetosVendas(root) {
  const directory = path.join(root, 'crawler');
  return fs.readdirSync(directory).filter(file => /^jf[A-Za-z0-9]+\.json$/.test(file) && !/Locacao|Retirados|Historico/.test(file)).map(file => file.slice(0, -5));
}

function recordsFromRows(rows, title) {
  if (!rows.length) return [];
  if (!rows[0].includes('dataExclusao') || !rows[0].includes('linkReal')) throw new Error(`Cabecalho nao reconhecido: ${title}. Nenhuma base foi limpa.`);
  return rows.slice(1).filter(row => row.some(value => value !== '')).map(row => Object.fromEntries(rows[0].map((key, index) => [key, row[index] ?? '']).filter(([key]) => key)));
}

export async function migrarRetiradosVendas({ root = backendRoot, spreadsheetId, aplicar = false, adapter } = {}) {
  const id = spreadsheetId ?? publicationEnvironment(root).GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!id || id === '11MOUe5l8ICx8BJqoBbqCqmeSYNJwYhh7KDilzwoUnxk') throw new Error('Configure a planilha de VENDAS, diferente da planilha de aluguel.');
  const api = adapter ?? await import('./_01extractor/services/googleSheets.js');
  const metadata = await api.getSheetsMetadata(id);
  const tabs = metadata.filter(tab => /^jf[A-Za-z0-9]+$/.test(tab.title.trim()) && !/Locacao|Retirados|Historico/.test(tab.title));
  const values = await api.readSheets(id, tabs.map(tab => `${quote(tab.title)}!A:Z`));
  const sheetsByProject = new Map(tabs.map((tab, index) => [tab.title.trim(), { ...tab, rows: values[index]?.values ?? [] }]));
  const collections = [...new Set([...descobrirProjetosVendas(root), ...sheetsByProject.keys()])].sort();
  const plans = collections.map(collection => {
    const outputPath = path.join(root, 'crawler', `${collection}.json`);
    const original = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : null;
    const local = original === null ? null : separarVendas(JSON.parse(original), collection);
    const tab = sheetsByProject.get(collection);
    const online = tab ? separarVendas(recordsFromRows(tab.rows, tab.title), collection) : null;
    const removed = [...(local?.retirados ?? []), ...(online?.retirados ?? [])];
    const previousHistoryPath = outputPath.replace(/\.json$/, 'RetiradosVendas.json');
    const previousHistory = fs.existsSync(previousHistoryPath) ? JSON.parse(fs.readFileSync(previousHistoryPath, 'utf8')) : [];
    if (!Array.isArray(previousHistory)) throw new Error(`Historico invalido: ${collection}.`);
    const history = [...new Map([...previousHistory, ...removed].map(item => [item.retiradaId, item])).values()];
    history.forEach(linhaRetiradoVendas);
    return { collection, outputPath, original, originalHash: original === null ? null : hash(original), local, online, tab, removed, history };
  });
  const changed = plans.filter(plan => plan.removed.length);
  const archive = [...new Map(changed.flatMap(plan => plan.history).map(item => [item.retiradaId, item])).values()];
  const existingArchive = metadata.find(tab => tab.title.trim() === 'retirados');
  const allocatedCells = metadata.reduce((sum, tab) => sum + tab.gridProperties.rowCount * tab.gridProperties.columnCount, 0);
  const reservedCells = archive.length * (existingArchive?.gridProperties.columnCount ?? 23);
  if (allocatedCells + reservedCells > 10000000) throw new Error('Espaco insuficiente para garantir o arquivo antes da limpeza; nenhuma base foi limpa.');
  const report = {
    projetos: plans.length,
    excluidosJson: plans.reduce((sum, plan) => sum + (plan.local?.retirados.length ?? 0), 0),
    excluidosSheets: plans.reduce((sum, plan) => sum + (plan.online?.retirados.length ?? 0), 0),
    versoesParaArquivar: archive.length,
    celulasAlocadas: allocatedCells,
    aplicar,
  };
  console.log(`MIGRACAO_VENDAS_PLANO=${JSON.stringify(report)}`);
  if (!aplicar || !changed.length) return report;

  const backupDirectory = path.join(root, '_03database/outros/migracao-retirados-vendas', new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(backupDirectory, { recursive: true });
  fs.writeFileSync(path.join(backupDirectory, 'planilhas.json'), JSON.stringify(changed.map(plan => ({ projeto: plan.collection, aba: plan.tab?.title, rows: plan.tab?.rows ?? [] })), null, 2));
  for (const plan of changed) {
    if (plan.original !== null) fs.writeFileSync(path.join(backupDirectory, `${plan.collection}.json`), plan.original);
    salvarHistoricoVendas(plan.outputPath, plan.removed);
  }
  await publicarRetiradosVendas(archive, id, api);
  for (const plan of changed) {
    if (plan.original !== null && hash(fs.readFileSync(plan.outputPath, 'utf8')) !== plan.originalHash) throw new Error(`JSON alterado durante a migracao: ${plan.collection}. Arquivo enviado, principal preservada.`);
  }
  const onlinePlans = changed.filter(plan => plan.tab);
  const refreshed = await api.readSheets(id, onlinePlans.map(plan => `${quote(plan.tab.title)}!A:Z`));
  onlinePlans.forEach((plan, index) => {
    if (JSON.stringify(refreshed[index]?.values ?? []) !== JSON.stringify(plan.tab.rows)) throw new Error(`Aba alterada durante a migracao: ${plan.collection}. Arquivo enviado, principal preservada.`);
  });
  const tails = [];
  for (const plan of onlinePlans) {
    const active = plan.online.ativos;
    const header = plan.tab.rows[0];
    const rows = [header, ...active.map(item => header.map(key => item[key] == null ? '' : typeof item[key] === 'object' ? JSON.stringify(item[key]) : item[key]))];
    const lastColumn = String.fromCharCode(64 + header.length);
    await api.writeSheet(id, `${quote(plan.tab.title)}!A1:${lastColumn}${rows.length}`, rows);
    if (plan.tab.rows.length > rows.length) tails.push(`${quote(plan.tab.title)}!A${rows.length + 1}:Z${plan.tab.rows.length}`);
  }
  await api.clearSheetsRanges(id, tails);
  const confirmed = await api.readSheets(id, onlinePlans.map(plan => `${quote(plan.tab.title)}!A:Z`));
  onlinePlans.forEach((plan, index) => {
    const active = plan.online.ativos;
    const records = recordsFromRows(confirmed[index]?.values ?? [], plan.tab.title);
    if (records.length !== active.length || separarVendas(records, plan.collection).retirados.length) throw new Error(`Principal Sheets nao confirmada: ${plan.collection}. Backup e historico disponiveis; JSON preservado.`);
  });
  for (const plan of changed) {
    if (plan.original !== null) {
      if (hash(fs.readFileSync(plan.outputPath, 'utf8')) !== plan.originalHash) throw new Error(`JSON alterado durante a migracao: ${plan.collection}.`);
      fs.writeFileSync(plan.outputPath, JSON.stringify(plan.local.ativos, null, 2));
    }
  }
  const result = { ...report, concluida: true, backupDirectory };
  fs.writeFileSync(path.join(backupDirectory, 'resultado.json'), JSON.stringify(result, null, 2));
  console.log(`MIGRACAO_VENDAS_CONCLUIDA=${JSON.stringify(result)}`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--aplicar', '--dry-run'].includes(arg)) || (args.includes('--aplicar') && args.includes('--dry-run'))) {
    console.error('Use --dry-run para diagnostico ou --aplicar para mover os excluidos.');
    process.exitCode = 1;
  } else {
    migrarRetiradosVendas({ aplicar: args.includes('--aplicar') }).catch(error => {
      console.error(`[MIGRACAO VENDAS] ${error.message}`);
      process.exitCode = 1;
    });
  }
}