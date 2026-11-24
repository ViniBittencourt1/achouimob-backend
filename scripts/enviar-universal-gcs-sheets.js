import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { JsonStorage } from '../src/infra/gcs/jsonStorage.js';
import { TransactionStore } from '../src/infra/gcs/transactionStore.js';
import { createUniversalSheetAdapter, exportUniversalSnapshot } from '../src/infra/gcs/universalSheets.js';

const configPath = fileURLToPath(new URL('../.env.piloto-universal', import.meta.url));
const config = dotenv.config({ path: configPath, override: true, quiet: true });
const required = [
  'GCS_BUCKET', 'GCS_OPERATION_SCOPE', 'ACHOUIMOB_COMPUTER_ID', 'ACHOUIMOB_ACTOR',
  'JF_UNIVERSAL_SPREADSHEET_ID', 'JF_UNIVERSAL_SHEET_ID', 'SHEETS_SERVICE_ACCOUNT_FILE',
];

if (config.error) {
  console.error(`Nao foi possivel carregar ${configPath}: ${config.error.message}`);
  process.exitCode = 1;
} else if (process.argv.length !== 2 || required.some(key => !config.parsed?.[key]?.trim()) ||
    !/^\d+$/.test(process.env.JF_UNIVERSAL_SHEET_ID)) {
  console.error(`Configure ${required.join(', ')} em ${configPath}.`);
  process.exitCode = 1;
} else {
  try {
    const transaction = new TransactionStore({
      storage: new JsonStorage({ bucketName: process.env.GCS_BUCKET }),
      scope: process.env.GCS_OPERATION_SCOPE, computerId: process.env.ACHOUIMOB_COMPUTER_ID,
    });
    const result = await exportUniversalSnapshot({
      transaction, spreadsheetId: process.env.JF_UNIVERSAL_SPREADSHEET_ID,
      sheetId: Number(process.env.JF_UNIVERSAL_SHEET_ID), actor: process.env.ACHOUIMOB_ACTOR,
      api: createUniversalSheetAdapter({ keyFile: process.env.SHEETS_SERVICE_ACCOUNT_FILE }),
      onBackup: backup => console.log(`Backup anterior verificado no GCS: ${backup.name}, geracao ${backup.generation}.`),
    });
    console.log(`Envio confirmado: ${result.vendas} vendas da revisao ${result.revision}; demais negociacoes preservadas.`);
  } catch (error) {
    console.error(`Envio ao Sheets falhou: ${error.message}`);
    if (error instanceof AggregateError) for (const cause of error.errors) console.error(`- ${cause.message}`);
    process.exitCode = 1;
  }
}
