import { randomUUID } from 'node:crypto';
import { google } from 'googleapis';
import { linhasUniversal } from '../../../_01extractor/crawlers/jfora/universal/sheets.js';
import { CABECALHO_IMOVEIS_SHEETS, negociacaoDaLinha } from '../../../_01extractor/crawlers/jfora/_utils/imoveisSheets.js';

const HEADER = [...CABECALHO_IMOVEIS_SHEETS, 'precoCondominio', 'precoIptu', 'precoTotal', 'precoOutros'];
const ACTIVE = 'crawler/jfUniversal.json';
const LEASE_MS = 15 * 60 * 1000;

function entered(cell) {
  return cell?.userEnteredValue ? { userEnteredValue: cell.userEnteredValue } : {};
}

function normalizedRows(rows) {
  const result = rows.map(row => Array.from({ length: HEADER.length }, (_, i) => entered(row?.values?.[i])));
  while (result.length && result.at(-1).every(cell => !cell.userEnteredValue)) result.pop();
  return result;
}

function cellValue(value) {
  if (value === null || value === undefined || value === '') return {};
  if (typeof value === 'string') return { userEnteredValue: { stringValue: value } };
  if (typeof value === 'number' && Number.isFinite(value)) return { userEnteredValue: { numberValue: value } };
  if (typeof value === 'boolean') return { userEnteredValue: { boolValue: value } };
  throw new Error('Campo de imovel nao pode ser representado no Sheets; aba preservada.');
}

function prepareChanges(sheet, records, sheetId) {
  if (sheet.sheetId !== sheetId || sheet.title !== 'jfUniversal' || sheet.columnCount !== HEADER.length) {
    throw new Error('Aba jfUniversal, ID ou quantidade de colunas incompativel; aba preservada.');
  }
  const before = normalizedRows(sheet.rows);
  if (JSON.stringify(before[0]?.map(cell => cell.userEnteredValue?.stringValue)) !== JSON.stringify(HEADER)) {
    throw new Error('Cabecalho jfUniversal incompativel; aba preservada.');
  }
  if (!Array.isArray(records) || !records.length ||
      records.some(item => !item || typeof item !== 'object' || Array.isArray(item) ||
        typeof item.linkReal !== 'string' || !item.linkReal.trim())) {
    throw new Error('Snapshot de vendas vazio ou invalido; aba preservada.');
  }
  const sales = linhasUniversal(records).map(row => [
    ...row.slice(0, 20).map(cellValue), cellValue('venda'), ...row.slice(20).map(cellValue),
  ]);
  const saleRows = [];
  for (let i = 1; i < before.length; i++) {
    if (before[i].every(cell => !cell.userEnteredValue)) continue;
    const negotiation = before[i][20].userEnteredValue;
    if (negotiation?.formulaValue) throw new Error('Negociacao calculada por formula; aba preservada.');
    const row = Array(21).fill('');
    row[20] = negotiation?.stringValue ?? '';
    if (negotiation && typeof negotiation.stringValue !== 'string') {
      throw new Error('Negociacao invalida na aba; dados preservados.');
    }
    if (negociacaoDaLinha(row) === 'venda') saleRows.push(i);
  }
  const needed = Math.max(0, sales.length - saleRows.length);
  if (before.length + needed > sheet.rowCount) throw new Error('Aba sem linhas suficientes; dados preservados.');
  for (let i = 0; i < needed; i++) saleRows.push(before.length + i);
  const changes = saleRows.map((index, i) => ({
    index, values: sales[i] ?? Array.from({ length: HEADER.length }, () => ({})),
  }));
  const expected = structuredClone(before);
  for (const change of changes) expected[change.index] = change.values;
  while (expected.length && expected.at(-1).every(cell => !cell.userEnteredValue)) expected.pop();
  return { before, expected, changes, sales: sales.length };
}

export function createUniversalSheetAdapter({ keyFile }) {
  if (!keyFile) throw new Error('Informe o arquivo de credenciais do Sheets.');
  const auth = new google.auth.GoogleAuth({ keyFile, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  const api = google.sheets({ version: 'v4', auth });
  return {
    async read(spreadsheetId) {
      const response = await api.spreadsheets.get({
        spreadsheetId, ranges: ["'jfUniversal'!A:Y"], includeGridData: true,
        fields: 'sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)),data(startRow,startColumn,rowData(values(userEnteredValue))))',
      });
      const sheet = response.data.sheets?.[0];
      const grid = sheet?.data?.[0];
      if (!sheet?.properties || !grid || (grid.startRow ?? 0) !== 0 || (grid.startColumn ?? 0) !== 0) {
        throw new Error('Nao foi possivel ler a aba jfUniversal.');
      }
      return {
        sheetId: sheet.properties.sheetId, title: sheet.properties.title,
        rowCount: sheet.properties.gridProperties?.rowCount,
        columnCount: sheet.properties.gridProperties?.columnCount,
        rows: grid.rowData ?? [],
      };
    },
    async write(spreadsheetId, sheetId, changes) {
      const groups = [];
      for (const change of changes) {
        const last = groups.at(-1);
        if (last && last.start + last.rows.length === change.index) last.rows.push({ values: change.values });
        else groups.push({ start: change.index, rows: [{ values: change.values }] });
      }
      await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: {
        requests: groups.map(group => ({ updateCells: {
          start: { sheetId, rowIndex: group.start, columnIndex: 0 },
          rows: group.rows, fields: 'userEnteredValue',
        } })),
      } });
    },
  };
}

export async function exportUniversalSnapshot({ transaction, spreadsheetId, sheetId, actor, api, onBackup = () => {} }) {
  if (!/^piloto-jfuniversal-[a-zA-Z0-9_-]+$/.test(transaction?.scope || '') ||
      !/^[a-zA-Z0-9_-]+$/.test(spreadsheetId || '') || !Number.isSafeInteger(sheetId) || sheetId < 0 ||
      typeof actor !== 'string' || !actor.trim() || !api?.read || !api?.write) {
    throw new Error('Configuracao de envio Universal invalida.');
  }
  const lease = await transaction.acquire(LEASE_MS);
  let failure;
  let result;
  let backupName;
  try {
    const manifest = await transaction.current();
    if (!manifest) throw new Error('Piloto GCS nao inicializado.');
    const records = await transaction.readDocument(manifest, ACTIVE);
    const sheet = await api.read(spreadsheetId);
    const prepared = prepareChanges(sheet, records, sheetId);
    const backup = {
      version: 1, createdAt: new Date().toISOString(), actor: actor.trim(), computerId: transaction.computerId,
      scope: transaction.scope, revision: manifest.revision, spreadsheetId, sheetId,
      title: sheet.title, rows: prepared.before,
    };
    backupName = `controles/backups-sheets/${transaction.scope}/${randomUUID()}.json`;
    const saved = await transaction.storage.write(backupName, backup, { expectedGeneration: 0 });
    const verified = await transaction.storage.readVersion(backupName, saved.generation);
    if (JSON.stringify(verified.data) !== JSON.stringify(backup)) throw new Error('Backup Sheets nao verificado; aba preservada.');
    onBackup({ name: backupName, generation: saved.generation });
    const latest = await api.read(spreadsheetId);
    if (latest.sheetId !== sheet.sheetId || latest.title !== sheet.title || latest.columnCount !== sheet.columnCount ||
        latest.rowCount !== sheet.rowCount || JSON.stringify(normalizedRows(latest.rows)) !== JSON.stringify(prepared.before)) {
      throw new Error('Aba mudou durante o preparo; envio cancelado.');
    }
    await transaction.requireLease(lease);
    await api.write(spreadsheetId, sheetId, prepared.changes);
    const after = await api.read(spreadsheetId);
    if (after.sheetId !== sheetId || after.title !== sheet.title || after.columnCount !== sheet.columnCount ||
        JSON.stringify(normalizedRows(after.rows)) !== JSON.stringify(prepared.expected)) {
      throw new Error('Envio nao confirmado por releitura; verifique a aba antes de repetir.');
    }
    result = { revision: manifest.revision, vendas: prepared.sales, backupName, backupGeneration: saved.generation };
  } catch (error) {
    failure = error;
  }
  try {
    await transaction.release(lease);
  } catch (error) {
    if (failure) throw new AggregateError([failure, error], 'Envio falhou e lock nao foi liberado; consulte o estado.');
    throw new Error('Envio finalizado, mas lock nao foi liberado; consulte o estado.', { cause: error });
  }
  if (failure) throw new Error(`Envio nao concluido${backupName ? `; backup: ${backupName}` : ''}: ${failure.message}`, { cause: failure });
  return result;
}
