import { createHash } from 'node:crypto';
import { JF_SPREADSHEET_ID } from './jfSheetsConfig.js';
import { aplicarCorrecoesBairroAlugueis } from '../_1Jf/bairros-alugueis.js';
import { aplicarCorrecoesTipoAlugueis } from '../_1Jf/tipos-alugueis.js';
import { aplicarCorrecoesFotoAlugueis } from '../_1Jf/fotos-alugueis.js';
import { aplicarCorrecoesCidadeAlugueis } from '../_1Jf/cidades-alugueis.js';

export const COLUNAS_LOCACAO = [
  'linkReal', 'titulo', 'preco', 'localizacao', 'tipoImovel', 'bairro', 'cidade',
  'dormitorioValor', 'banheiroValor', 'ambienteValor', 'areaValor', 'garagemValor',
  'elevadorValor', 'codigoBase', 'linkCard', 'corretor', 'dataInclusao',
  'dataExclusao', 'linkFoto', 'atualizadoEm',
];

export function identificarImovel(item, identificarPorLink = false) {
  const codigo = String(item.codigoBase ?? '').trim();
  if (!identificarPorLink && codigo && codigo !== '0') return `codigo:${codigo}`;
  const url = new URL(item.linkReal);
  url.search = '';
  url.hash = '';
  return `link:${url.href}`;
}

export function reconciliarLocacao(imoveis, anteriores, imobiliaria, { vazioConfirmado = false, totalEsperado, preservarOcorrencias = false, identificarPorLink = false } = {}) {
  if (!imobiliaria || !Array.isArray(imoveis) || !Array.isArray(anteriores)) throw new Error('Dados de sincronizacao de locacao invalidos.');
  if (!imoveis.length && !vazioConfirmado) throw new Error('Coleta vazia nao confirmada; dados anteriores preservados.');
  if (totalEsperado !== undefined && (!Number.isSafeInteger(totalEsperado) || totalEsperado !== imoveis.length)) throw new Error('Coleta de locacao incompleta; dados anteriores preservados.');
  const existentes = new Map(anteriores.map(item => [identificarImovel(item, identificarPorLink), item]));
  const atuais = new Map();
  const ocorrencias = [];
  for (const item of imoveis) {
    if (!item.linkReal || (item.preco !== null && !Number.isFinite(item.preco))) throw new Error('Imovel de locacao sem link ou preco valido.');
    const key = identificarImovel(item, identificarPorLink);
    if (atuais.has(key) && !preservarOcorrencias) throw new Error('Imoveis duplicados na coleta; dados anteriores preservados.');
    const anterior = existentes.get(key);
    const ativo = { ...item, dataInclusao: anterior?.dataInclusao || item.dataInclusao || new Date().toISOString(), dataExclusao: '' };
    atuais.set(key, ativo);
    ocorrencias.push(ativo);
  }
  const retirados = [];
  for (const [key, item] of existentes) {
    if (atuais.has(key)) continue;
    const retiradaId = createHash('sha256').update(JSON.stringify([imobiliaria, key, COLUNAS_LOCACAO.filter(column => column !== 'dataExclusao').map(column => item[column] ?? '')])).digest('hex');
    retirados.push({ ...item, imobiliaria, retiradaId });
  }
  return { ativos: preservarOcorrencias ? ocorrencias : Array.from(atuais.values()), retirados };
}

let pendingArchive = Promise.resolve();

export async function enriquecerLocacao(browser, imoveis, enrich, options = {}) {
  const precos = new Map(imoveis.map(item => [item, item.preco]));
  await enrich(browser, imoveis, options);
  for (const item of imoveis) item.preco = precos.get(item);
}

function valorCelula(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'object') return value;
  const seconds = value._seconds ?? value.seconds;
  if (seconds !== undefined) return new Date(Number(seconds) * 1000).toISOString();
  return value instanceof Date ? value.toISOString() : JSON.stringify(value);
}

async function publicarRetirados(retirados, spreadsheetId, abaRetirados = 'retirados', identificarPorLink = false) {
  if (!retirados.length) return;
  const writing = pendingArchive.catch(() => {}).then(async () => {
    const { ensureSheet, readSheet, writeHeader, appendRows } = await import('../../../services/googleSheets.js');
    const title = await ensureSheet(spreadsheetId, abaRetirados, 21);
    const range = `'${title.replace(/'/g, "''")}'`;
    const rows = await readSheet(spreadsheetId, `${range}!A:U`, { valueRenderOption: 'UNFORMATTED_VALUE' });
    const header = [...COLUNAS_LOCACAO, 'imobiliaria'];
    if (rows.length && JSON.stringify(rows[0]) !== JSON.stringify(header)) throw new Error('Cabecalho da aba retirados incompativel; historico preservado.');
    if (!rows.length) await writeHeader(spreadsheetId, title, header);
    const rowKey = row => JSON.stringify([row[20], String(identificarPorLink ? row[0] : row[13] || row[0]), row[17]]);
    const seen = new Set(rows.slice(1).map(rowKey));
    const novas = [];
    for (const item of retirados) {
      const row = [...COLUNAS_LOCACAO.map(column => valorCelula(item[column])), item.imobiliaria];
      if (seen.has(rowKey(row))) continue;
      seen.add(rowKey(row));
      novas.push(row);
    }
    if (novas.length) await appendRows(spreadsheetId, `${range}!A:U`, novas, { insertDataOption: 'OVERWRITE' });
  });
  pendingArchive = writing;
  await writing;
}

export async function sincronizarLocacao({ imoveis, anteriores, imobiliaria, outputPath, exportToSheets, spreadsheetId = JF_SPREADSHEET_ID, vazioConfirmado = false, totalEsperado, abaRetirados = 'retiradosLocacao', exportOptions = {}, preservarOcorrencias = false, identificarPorLink = false }) {
  const fs = (await import('node:fs')).default;
  const path = await import('node:path');
  const anterioresArray = anteriores instanceof Map ? Array.from(anteriores.values()) : anteriores ?? (fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, 'utf8')) : []);
  const result = reconciliarLocacao(imoveis, anterioresArray, imobiliaria, { vazioConfirmado, totalEsperado, preservarOcorrencias, identificarPorLink });
  result.ativos = aplicarCorrecoesBairroAlugueis(result.ativos, imobiliaria, path.dirname(path.dirname(outputPath)));
  result.ativos = aplicarCorrecoesCidadeAlugueis(result.ativos, imobiliaria, path.dirname(path.dirname(outputPath)));
  result.ativos = aplicarCorrecoesTipoAlugueis(result.ativos, imobiliaria, path.dirname(path.dirname(outputPath)));
  result.ativos = aplicarCorrecoesFotoAlugueis(result.ativos, imobiliaria, path.dirname(path.dirname(outputPath)));
  const historyPath = path.join(path.dirname(outputPath), `${imobiliaria}RetiradosLocacao.json`);
  const history = fs.existsSync(historyPath) ? JSON.parse(fs.readFileSync(historyPath, 'utf8')) : [];
  if (!Array.isArray(history)) throw new Error('Historico local de retirados invalido; dados anteriores preservados.');
  const ids = new Set(history.map(item => item.retiradaId));
  for (const item of result.retirados) {
    if (ids.has(item.retiradaId)) continue;
    history.push({ ...item, dataExclusao: item.dataExclusao || new Date().toISOString() });
    ids.add(item.retiradaId);
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  if (result.retirados.length) fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8');
  await publicarRetirados(history, spreadsheetId, abaRetirados, identificarPorLink);
  const ativos = preservarOcorrencias ? result.ativos : new Map(result.ativos.map(item => [item.linkReal, item]));
  await exportToSheets(ativos, { spreadsheetId, sheetName: imobiliaria, ...exportOptions, negociacao: 'aluguel' });
  fs.writeFileSync(outputPath, JSON.stringify(result.ativos, null, 2), 'utf8');
  console.log(`[${imobiliaria}Locacao] Sincronizado: ${result.ativos.length} ativos; ${result.retirados.length} retirados.`);
  return result;
}