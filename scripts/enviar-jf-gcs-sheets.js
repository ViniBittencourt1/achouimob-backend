import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { JsonStorage } from '../src/infra/gcs/jsonStorage.js';
import { TransactionStore } from '../src/infra/gcs/transactionStore.js';
import { createUniversalSheetAdapter, exportJfSnapshot } from '../src/infra/gcs/universalSheets.js';
import { projetoJfGcs } from '../_01extractor/crawlers/jfora/_utils/jfGrupoGcs.js';

const configPath = fileURLToPath(new URL('../.env.piloto-jf', import.meta.url));
const sheetsPath = fileURLToPath(new URL('../.env.piloto-universal', import.meta.url));
const config = dotenv.config({ path: configPath, processEnv: {}, quiet: true });
const sheetsConfig = dotenv.config({ path: sheetsPath, processEnv: {}, quiet: true });
const [name, negotiation] = process.argv.slice(2);
try {
  if (config.error) throw config.error;
  if (sheetsConfig.error) throw sheetsConfig.error;
  const c = config.parsed;
  const s = sheetsConfig.parsed;
  const required = ['GCS_BUCKET', 'GCS_OPERATION_SCOPE', 'ACHOUIMOB_COMPUTER_ID', 'ACHOUIMOB_ACTOR'];
  if (required.some(key => !c[key]?.trim()) || !s.JF_UNIVERSAL_SPREADSHEET_ID?.trim() ||
      !s.SHEETS_SERVICE_ACCOUNT_FILE?.trim() || !['venda', 'aluguel'].includes(negotiation) ||
      process.argv.length !== 4 || !/^piloto-jf-compartilhado-[a-zA-Z0-9_-]+$/.test(c.GCS_OPERATION_SCOPE)) {
    throw new Error('Use jf:gcs:enviar -- <projeto> <venda|aluguel> com as configuracoes GCS e Sheets.');
  }
  const project = projetoJfGcs(name);
  const transaction = new TransactionStore({
    storage: new JsonStorage({ bucketName: c.GCS_BUCKET }),
    scope: c.GCS_OPERATION_SCOPE, computerId: c.ACHOUIMOB_COMPUTER_ID,
  });
  const api = createUniversalSheetAdapter({ keyFile: s.SHEETS_SERVICE_ACCOUNT_FILE, project });
  const sheet = await api.read(s.JF_UNIVERSAL_SPREADSHEET_ID);
  const result = await exportJfSnapshot({
    transaction, spreadsheetId: s.JF_UNIVERSAL_SPREADSHEET_ID, sheetId: sheet.sheetId,
    actor: c.ACHOUIMOB_ACTOR, api, project, negotiation,
    onBackup: backup => console.log(`Backup anterior verificado no GCS: ${backup.name}, geracao ${backup.generation}.`),
  });
  console.log(`Envio confirmado para ${project}: ${JSON.stringify(result)}. Outra negociacao preservada.`);
} catch (error) {
  console.error(`Envio nao concluido: ${error.message}`);
  if (error instanceof AggregateError) for (const cause of error.errors) console.error(`- ${cause.message}`);
  process.exitCode = 1;
}
