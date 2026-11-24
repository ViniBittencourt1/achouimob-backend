import { google } from 'googleapis';

const HEADER = ['operacao', 'revisao', 'quando', 'computador', 'operador', 'tipo', 'dados'];

export function createReportSheetsAdapter() {
  const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  const sheets = google.sheets({ version: 'v4', auth });
  return {
    async ensureSheet(spreadsheetId, title, columns, rows) {
      const response = await sheets.spreadsheets.get({
        spreadsheetId, fields: 'sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))',
      });
      const existing = response.data.sheets?.find(sheet => sheet.properties?.title === title)?.properties;
      if (!existing) {
        await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: {
          requests: [{ addSheet: { properties: { title, gridProperties: { rowCount: rows, columnCount: columns } } } }],
        } });
        return title;
      }
      const grid = existing.gridProperties;
      const updates = {};
      if (grid.rowCount < rows) updates.rowCount = rows;
      if (grid.columnCount < columns) updates.columnCount = columns;
      if (Object.keys(updates).length) {
        await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{
          updateSheetProperties: {
            properties: { sheetId: existing.sheetId, gridProperties: updates },
            fields: Object.keys(updates).map(key => `gridProperties.${key}`).join(','),
          },
        }] } });
      }
      return title;
    },
    async readSheet(spreadsheetId, range) {
      const response = await sheets.spreadsheets.values.get({ spreadsheetId, range, valueRenderOption: 'UNFORMATTED_VALUE' });
      return response.data.values || [];
    },
    async writeSheet(spreadsheetId, range, values) {
      await sheets.spreadsheets.values.update({ spreadsheetId, range, valueInputOption: 'RAW', requestBody: { values } });
    },
  };
}

export async function deliverReport({ store, operationId, spreadsheetId, actor, api }) {
  if (!api || typeof api.ensureSheet !== 'function' || typeof api.readSheet !== 'function' || typeof api.writeSheet !== 'function') {
    throw new Error('Adaptador de relatorios Sheets invalido.');
  }
  const { report, audit } = await store.updateReport(operationId, spreadsheetId, actor);
  if (report.status === 'entregue') return { status: 'entregue', operationId };
  const rowNumber = audit.revision + 1;
  if (!Number.isSafeInteger(rowNumber) || rowNumber > 10000000) throw new Error('Revisao excede o limite de linhas do Sheets.');
  const title = `GCS-${store.transaction.scope}`;
  const quoted = `'${title.replace(/'/g, "''")}'`;
  const row = [operationId, String(audit.revision), audit.timestamp, audit.computerId, audit.actor, audit.type, JSON.stringify(report.data)];
  if (row.some(value => typeof value !== 'string' || value.length > 50000)) {
    throw new Error('Relatorio invalido ou com campo maior que o limite de celula Sheets.');
  }
  await api.ensureSheet(spreadsheetId, title, HEADER.length, Math.max(1000, rowNumber));
  const header = (await api.readSheet(spreadsheetId, `${quoted}!A1:G1`))[0];
  if (header?.length && JSON.stringify(header) !== JSON.stringify(HEADER)) throw new Error('Cabecalho de relatorios incompativel; aba preservada.');
  const range = `${quoted}!A${rowNumber}:G${rowNumber}`;
  const existing = (await api.readSheet(spreadsheetId, range))[0];
  if (existing?.length && JSON.stringify(existing) !== JSON.stringify(row)) throw new Error('Linha de relatorio ocupada por outros dados; aba preservada.');
  if (!header?.length) await api.writeSheet(spreadsheetId, `${quoted}!A1:G1`, [HEADER]);
  if (!existing?.length) await api.writeSheet(spreadsheetId, range, [row]);
  const confirmedHeader = (await api.readSheet(spreadsheetId, `${quoted}!A1:G1`))[0];
  const confirmedRow = (await api.readSheet(spreadsheetId, range))[0];
  if (JSON.stringify(confirmedHeader) !== JSON.stringify(HEADER) || JSON.stringify(confirmedRow) !== JSON.stringify(row)) {
    throw new Error('Envio ao Sheets nao confirmado; relatorio permanece pendente.');
  }
  await store.updateReport(operationId, spreadsheetId, actor, true);
  return { status: 'entregue', operationId };
}

export async function retryPendingReports({ store, spreadsheetId, actor, api }) {
  const manifest = await store.transaction.current();
  if (!manifest) throw new Error('Base operacional ainda nao inicializada.');
  const prefix = 'controles/relatorios/';
  const keys = Object.keys(manifest.documents).filter(key => key.startsWith(prefix)).sort();
  const results = [];
  for (const key of keys) {
    const report = await store.transaction.readDocument(manifest, key);
    if (!report || !['pendente', 'entregue'].includes(report.status) || key !== `${prefix}${report.operationId}.json`) {
      throw new Error(`Relatorio invalido: ${key}.`);
    }
    if (report.status !== 'pendente') continue;
    try {
      results.push(await deliverReport({ store, operationId: report.operationId, spreadsheetId, actor, api }));
    } catch (error) {
      results.push({ operationId: report.operationId, status: 'pendente', warning: error.message });
    }
  }
  return results;
}
