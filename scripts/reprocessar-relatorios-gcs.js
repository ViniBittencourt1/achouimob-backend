import { JsonStorage } from '../src/infra/gcs/jsonStorage.js';
import { TransactionStore } from '../src/infra/gcs/transactionStore.js';
import { OperationalStore } from '../src/infra/gcs/operationalStore.js';
import { createReportSheetsAdapter, retryPendingReports } from '../src/infra/gcs/reportSheets.js';

const { GCS_BUCKET, GCS_OPERATION_SCOPE, ACHOUIMOB_COMPUTER_ID, ACHOUIMOB_ACTOR, GCS_REPORTS_SPREADSHEET_ID } = process.env;
if (!GCS_BUCKET || !/^piloto-jfuniversal-[a-zA-Z0-9_-]+$/.test(GCS_OPERATION_SCOPE || '') ||
    !ACHOUIMOB_COMPUTER_ID || !ACHOUIMOB_ACTOR || !GCS_REPORTS_SPREADSHEET_ID || process.argv.length !== 2) {
  console.error('Informe bucket, escopo piloto, computador, operador e planilha de relatorios.');
  process.exitCode = 1;
} else {
  try {
    const transaction = new TransactionStore({
      storage: new JsonStorage({ bucketName: GCS_BUCKET }), scope: GCS_OPERATION_SCOPE, computerId: ACHOUIMOB_COMPUTER_ID,
    });
    const results = await retryPendingReports({
      store: new OperationalStore({ transaction }), spreadsheetId: GCS_REPORTS_SPREADSHEET_ID,
      actor: ACHOUIMOB_ACTOR, api: createReportSheetsAdapter(),
    });
    console.log(JSON.stringify(results, null, 2));
    if (results.some(result => result.status !== 'entregue')) process.exitCode = 1;
  } catch (error) {
    console.error(`Reprocessamento nao concluido: ${error.message}`);
    if (error instanceof AggregateError) for (const cause of error.errors) console.error(`- ${cause.message}`);
    process.exitCode = 1;
  }
}
