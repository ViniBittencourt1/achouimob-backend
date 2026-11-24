import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { JF_SPREADSHEET_ID } from './jfSheetsConfig.js';

const { publicationEnvironment } = createRequire(import.meta.url)('../../../../publication-config.cjs');

export function arquivoPrincipalVendas(file) {
  return /^(?:jf|nit|uba|rio)[A-Za-z0-9-]+\.json$/i.test(file) && !/Locacao|Retirados|Historico/i.test(file);
}

export function arquivoPrincipalLocacao(file) {
  return /^(?:jf|nit|uba|rio)[A-Za-z0-9-]+Locacao\.json$/i.test(file) && !/Retirados|Historico/i.test(file);
}

export function arquivoPrincipalImoveis(file) {
  return arquivoPrincipalVendas(file) || arquivoPrincipalLocacao(file);
}

function codigoVenda(item) {
  const codigo = String(item.codigoBase ?? '').trim();
  return codigo && codigo !== '0' && !/^nenhum$/i.test(codigo) ? codigo : '';
}

function linkVenda(item) {
  const url = new URL(item.linkReal);
  url.search = '';
  url.hash = '';
  return url.href;
}

// Sites que reutilizam a mesma referencia em imoveis distintos (links diferentes) passam a ser identificados pelo link.
function codigosAmbiguos(...listas) {
  const ambiguos = new Set();
  for (const lista of listas) {
    const links = new Map();
    for (const item of lista) {
      const codigo = codigoVenda(item);
      if (!codigo || !item.linkReal) continue;
      const link = linkVenda(item);
      if (links.has(codigo) && links.get(codigo) !== link) ambiguos.add(codigo);
      else links.set(codigo, link);
    }
  }
  return ambiguos;
}

export function identidadeBase(item, ambiguos = new Set()) {
  const codigo = codigoVenda(item);
  if (codigo && !(ambiguos.has(codigo) && item.linkReal)) return `codigo:${codigo}`;
  if (item.linkReal) return `link:${linkVenda(item)}`;
  return `legado:${JSON.stringify(item)}`;
}

export const COLUNAS_VENDAS = [
  'linkReal', 'titulo', 'preco', 'localizacao', 'tipoImovel', 'bairro', 'cidade',
  'dormitorioValor', 'banheiroValor', 'ambienteValor', 'areaValor', 'garagemValor',
  'elevadorValor', 'codigoBase', 'linkCard', 'corretor', 'dataInclusao',
  'dataExclusao', 'linkFoto', 'atualizadoEm',
];

export function separarVendas(records, imobiliaria) {
  if (!/^(?:jf|nit|uba|rio)[A-Za-z0-9-]+$/.test(imobiliaria) || /Locacao|Retirados/.test(imobiliaria) || !Array.isArray(records)) {
    throw new Error('Selecione uma lista valida de vendas e sua imobiliaria.');
  }
  const ativos = [];
  const retirados = [];
  for (const item of records) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Registro de vendas invalido; base preservada.');
    const date = String(item.dataExclusao ?? '').trim();
    if ((!date || date === '0') && item.ativo !== false) {
      ativos.push({ ...item, dataExclusao: '' });
    } else {
      const snapshotData = Object.fromEntries(Object.entries(item).filter(([key]) => key !== 'dataExclusao'));
      const snapshot = JSON.stringify([imobiliaria, snapshotData], (_key, value) => value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).sort((left, right) => left[0].localeCompare(right[0])))
        : value);
      const retiradaId = createHash('sha256').update(snapshot).digest('hex');
      retirados.push({ ...item, imobiliaria, retiradaId });
    }
  }
  return { ativos, retirados };
}

export function salvarHistoricoVendas(outputPath, retirados) {
  const historyPath = outputPath.replace(/\.json$/i, 'RetiradosVendas.json');
  if (historyPath === outputPath || /Locacao|Retirados/.test(path.basename(outputPath))) throw new Error('Destino de vendas invalido.');
  const history = fs.existsSync(historyPath) ? JSON.parse(fs.readFileSync(historyPath, 'utf8')) : [];
  const merged = mesclarHistoricoVendas(history, retirados);
  if (retirados.length) fs.writeFileSync(historyPath, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

export function mesclarHistoricoVendas(history, retirados) {
  if (!Array.isArray(history)) throw new Error('Historico de vendas invalido; base preservada.');
  const merged = [...history];
  const ids = new Set(merged.map(item => item.retiradaId));
  for (const item of retirados) {
    if (!ids.has(item.retiradaId)) {
      merged.push(item);
      ids.add(item.retiradaId);
    }
  }
  return merged;
}

export const CABECALHO_RETIRADOS_VENDAS = [...COLUNAS_VENDAS, 'imobiliaria', 'retiradaId', 'dadosExtras'];

const cellValue = value => value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : value;

export function linhaRetiradoVendas(item) {
  const extras = Object.fromEntries(Object.entries(item).filter(([key]) => !CABECALHO_RETIRADOS_VENDAS.includes(key)));
  const row = [...COLUNAS_VENDAS.map(key => cellValue(item[key])), item.imobiliaria, item.retiradaId, item.dadosExtras === undefined ? JSON.stringify(extras) : cellValue(item.dadosExtras)];
  if (row.some(value => typeof value === 'string' && value.length > 50000)) throw new Error('Campo excede o limite de uma celula Sheets; historico local preservado, base principal nao removida.');
  return row;
}

let pendingArchive = Promise.resolve();

export async function publicarRetiradosVendas(retirados, spreadsheetId, adapter) {
  if (!spreadsheetId) throw new Error('Defina GOOGLE_SHEETS_SPREADSHEET_ID para arquivar vendas.');
  if (!retirados.length) return { enviados: 0 };
  const rows = retirados.map(linhaRetiradoVendas);
  const writing = pendingArchive.catch(() => {}).then(async () => {
    const api = adapter ?? await import('../../../services/googleSheets.js');
    const title = await api.ensureSheet(spreadsheetId, 'retirados', CABECALHO_RETIRADOS_VENDAS.length);
    const range = `'${title.replace(/'/g, "''")}'`;
    const previous = await api.readSheet(spreadsheetId, `${range}!A:W`, { valueRenderOption: 'UNFORMATTED_VALUE' });
    if (previous.length && JSON.stringify(previous[0]) !== JSON.stringify(CABECALHO_RETIRADOS_VENDAS)) throw new Error('Cabecalho retirados de vendas incompativel; nao sera sobrescrito.');
    if (!previous.length) await api.writeHeader(spreadsheetId, title, CABECALHO_RETIRADOS_VENDAS);
    const ids = new Set(previous.slice(1).map(row => row[21]).filter(Boolean));
    const additions = rows.filter(row => {
      if (ids.has(row[21])) return false;
      ids.add(row[21]);
      return true;
    });
    for (let offset = 0; offset < additions.length; offset += 200) {
      await api.appendRows(spreadsheetId, `${range}!A:W`, additions.slice(offset, offset + 200), { insertDataOption: 'OVERWRITE' });
    }
    const confirmed = await api.readSheet(spreadsheetId, `${range}!A:W`, { valueRenderOption: 'UNFORMATTED_VALUE' });
    const confirmedById = new Map(confirmed.slice(1).map(row => [row[21], row]));
    if (rows.some(row => JSON.stringify(confirmedById.get(row[21])) !== JSON.stringify(row))) throw new Error('Envio de retirados nao confirmado; base principal preservada.');
    return { enviados: additions.length };
  });
  pendingArchive = writing;
  return writing;
}

export function reconciliarVendas(imoveisRaspados, anteriores, consolidados, imobiliaria, { vazioConfirmado = false, totalEsperado, codigoRepetidoPorLink = false, preservarOcorrencias = false, identificarPorLink = false } = {}) {
  if (!Array.isArray(imoveisRaspados) || !Array.isArray(anteriores)) throw new Error('Coleta de vendas invalida; base preservada.');
  const old = separarVendas(anteriores, imobiliaria);
  if (!imoveisRaspados.length && old.ativos.length && !vazioConfirmado) throw new Error('Coleta vazia nao confirmada; vendas anteriores preservadas.');
  if (totalEsperado !== undefined && imoveisRaspados.length !== totalEsperado) throw new Error('Coleta de vendas incompleta; base preservada.');
  if (imoveisRaspados.some(item => !item?.linkReal)) throw new Error('Venda raspada sem link; base preservada.');
  const ambiguos = codigoRepetidoPorLink ? codigosAmbiguos(imoveisRaspados, old.ativos) : new Set();
  const identidadeVenda = item => identificarPorLink && item.linkReal ? `link:${linkVenda(item)}` : identidadeBase(item, ambiguos);
  const currentByKey = new Map();
  for (const item of imoveisRaspados) {
    const key = identidadeVenda(item);
    if (currentByKey.has(key) && !preservarOcorrencias) throw new Error('Vendas duplicadas na coleta; base preservada.');
    currentByKey.set(key, item);
  }
  const consolidatedRecords = consolidados instanceof Map ? [...consolidados.values()] : consolidados;
  if (!Array.isArray(consolidatedRecords)) throw new Error('Consolidacao de vendas ausente; base preservada.');
  const consolidated = separarVendas(consolidatedRecords, imobiliaria);
  if (consolidated.ativos.some(item => !currentByKey.has(identidadeVenda(item)))) throw new Error('Consolidacao sinaliza coleta parcial; nenhuma retirada sera aplicada.');
  const consolidatedByKey = new Map(consolidated.ativos.map(item => [identidadeVenda(item), item]));
  const previousByKey = new Map(anteriores.map(item => [identidadeVenda(item), item]));
  const ocorrencias = preservarOcorrencias ? imoveisRaspados.map(item => [identidadeVenda(item), item]) : [...currentByKey];
  const ativos = ocorrencias.map(([key, item]) => ({
    ...consolidatedByKey.get(key),
    ...item,
    dataInclusao: previousByKey.get(key)?.dataInclusao || item.dataInclusao || new Date().toISOString(),
    dataExclusao: '',
  }));
  const absent = anteriores.filter(item => !currentByKey.has(identidadeVenda(item))).map(item => ({
    ...item,
    dataExclusao: String(item.dataExclusao ?? '').trim() && String(item.dataExclusao) !== '0' ? item.dataExclusao : new Date().toISOString(),
  }));
  const additional = consolidated.retirados.filter(item => !currentByKey.has(identidadeVenda(item)) && !previousByKey.has(identidadeVenda(item)));
  return { ativos, retirados: separarVendas([...absent, ...additional], imobiliaria).retirados };
}

export const ARQUIVOS_CORRECOES_VENDAS = [
    ['_03database/outros/city-json-manual-corrections.json', 'cidade'],
    ['_03database/filtros/_jfBairrosManualCorrections.json', 'bairro'],
    ['_03database/outros/tipo-imovel-json-manual-corrections.json', 'tipoImovel'],
    ['_03database/outros/localizacao-json-manual-corrections.json', 'localizacao'],
    ['_03database/outros/linkfoto-json-manual-corrections.json', 'linkFoto'],
    ['_03database/outros/preco-json-manual-corrections.json', 'preco'],
];

export function aplicarCorrecoesVendasDados(records, fileName, correctionsByFile) {
  const corrected = records.map(item => ({ ...item }));
  for (const [relative, field] of ARQUIVOS_CORRECOES_VENDAS) {
    const corrections = correctionsByFile[relative];
    if (corrections === undefined) continue;
    if (!Array.isArray(corrections)) throw new Error(`Correcoes de vendas invalidas: ${relative}.`);
    const byLink = new Map(corrections.filter(item => String(item.file ?? '').toLowerCase() === fileName.toLowerCase() && Object.hasOwn(item, field)).map(item => [item.linkReal, item[field]]));
    for (const item of corrected) if (byLink.has(item.linkReal)) item[field] = byLink.get(item.linkReal);
  }
  return corrected;
}

function aplicarCorrecoesVendas(records, outputPath) {
  const root = path.dirname(path.dirname(outputPath));
  const corrections = {};
  for (const [relative] of ARQUIVOS_CORRECOES_VENDAS) {
    const file = path.join(root, relative);
    if (fs.existsSync(file)) corrections[relative] = JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  return aplicarCorrecoesVendasDados(records, path.basename(outputPath), corrections);
}

export async function sincronizarVendas({ imoveisRaspados, consolidados, imobiliaria, outputPath, exportToSheets, spreadsheetId, vazioConfirmado = false, totalEsperado, codigoRepetidoPorLink, adapter, preservarOcorrencias = false, identificarPorLink = false }) {
  const destination = outputPath ?? fileURLToPath(new URL(`../../../../crawler/${imobiliaria}.json`, import.meta.url));
  if (path.basename(destination) !== `${imobiliaria}.json`) throw new Error('Destino principal de vendas invalido.');
  const id = spreadsheetId ?? (/^jf/i.test(imobiliaria) ? JF_SPREADSHEET_ID : publicationEnvironment(path.dirname(path.dirname(destination))).GOOGLE_SHEETS_SPREADSHEET_ID);
  if (!id || id === '11MOUe5l8ICx8BJqoBbqCqmeSYNJwYhh7KDilzwoUnxk') throw new Error('Planilha de vendas ausente ou apontando para aluguel.');
  const original = fs.existsSync(destination) ? fs.readFileSync(destination, 'utf8') : null;
  const previous = original === null ? [] : JSON.parse(original);
  const result = reconciliarVendas(imoveisRaspados, previous, consolidados, imobiliaria, { vazioConfirmado, totalEsperado, codigoRepetidoPorLink, preservarOcorrencias, identificarPorLink });
  result.ativos = aplicarCorrecoesVendas(result.ativos, destination);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const history = salvarHistoricoVendas(destination, result.retirados);
  await publicarRetiradosVendas(history, id, adapter);
  if (original !== null && fs.readFileSync(destination, 'utf8') !== original) throw new Error('JSON de vendas mudou durante sincronizacao; base preservada.');
  await exportToSheets(preservarOcorrencias ? result.ativos : new Map(result.ativos.map(item => [item.linkReal, item])), { spreadsheetId: id, sheetName: imobiliaria, negociacao: 'venda' });
  if (original !== null && fs.readFileSync(destination, 'utf8') !== original) throw new Error('JSON de vendas mudou durante exportacao; base preservada.');
  fs.writeFileSync(destination, JSON.stringify(result.ativos, null, 2), 'utf8');
  console.log(`[${imobiliaria}] Vendas sincronizadas: ${result.ativos.length} ativos; ${result.retirados.length} retirados.`);
  return result;
}