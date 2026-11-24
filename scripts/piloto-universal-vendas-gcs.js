import { randomUUID } from 'node:crypto';
import { JsonStorage } from '../src/infra/gcs/jsonStorage.js';
import { TransactionStore } from '../src/infra/gcs/transactionStore.js';
import { OperationalStore } from '../src/infra/gcs/operationalStore.js';
import { createReportSheetsAdapter, deliverReport } from '../src/infra/gcs/reportSheets.js';
import { runUniversalSalesGcs } from '../_01extractor/crawlers/jfora/universal/gcsVendas.js';

const { GCS_BUCKET, GCS_OPERATION_SCOPE, ACHOUIMOB_COMPUTER_ID, ACHOUIMOB_ACTOR, GCS_REPORTS_SPREADSHEET_ID } = process.env;
const operationId = process.argv[2] || randomUUID();
if (typeof global.gc !== 'function') {
  console.error('Inicie o piloto com node --expose-gc para limitar o uso de memoria durante a coleta.');
  process.exitCode = 1;
} else if (!GCS_BUCKET || !/^piloto-jfuniversal-[a-zA-Z0-9_-]+$/.test(GCS_OPERATION_SCOPE || '') ||
    !ACHOUIMOB_COMPUTER_ID || !ACHOUIMOB_ACTOR || process.argv.length > 3 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(operationId)) {
  console.error('Informe GCS_BUCKET, escopo piloto, computador, operador e opcionalmente UUID valido.');
  process.exitCode = 1;
} else {
  console.log(`Operacao: ${operationId}. Guarde este identificador para recuperacao.`);
  try {
    const transaction = new TransactionStore({
      storage: new JsonStorage({ bucketName: GCS_BUCKET }), scope: GCS_OPERATION_SCOPE, computerId: ACHOUIMOB_COMPUTER_ID,
    });
    const store = new OperationalStore({ transaction });
    const report = GCS_REPORTS_SPREADSHEET_ID
      ? id => deliverReport({ store, operationId: id, spreadsheetId: GCS_REPORTS_SPREADSHEET_ID, actor: ACHOUIMOB_ACTOR, api: createReportSheetsAdapter() })
      : undefined;
    const result = await runUniversalSalesGcs({ store, actor: ACHOUIMOB_ACTOR, operationId, report });
    console.log(JSON.stringify(result, null, 2));
    if (result.reportWarning) console.warn(result.reportWarning);
    else if (!report) console.warn('Relatorio pendente: GCS_REPORTS_SPREADSHEET_ID nao configurado.');
  } catch (error) {
    console.error(`Piloto nao concluido. Consulte a operacao ${operationId} no GCS antes de repetir: ${error.message}`);
    if (error instanceof AggregateError) for (const cause of error.errors) console.error(`- ${cause.message}`);
    process.exitCode = 1;
  }
}
