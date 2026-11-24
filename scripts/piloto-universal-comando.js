import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const configPath = fileURLToPath(new URL('../.env.piloto-universal', import.meta.url));
const config = dotenv.config({ path: configPath, override: true, quiet: true });
const required = ['GCS_BUCKET', 'GCS_OPERATION_SCOPE', 'ACHOUIMOB_COMPUTER_ID', 'ACHOUIMOB_ACTOR'];

if (config.error) {
  console.error(`Nao foi possivel carregar ${configPath}: ${config.error.message}`);
  process.exitCode = 1;
} else if (required.some(key => !config.parsed?.[key]?.trim())) {
  console.error(`Configure ${required.join(', ')} em ${configPath}.`);
  process.exitCode = 1;
} else {
  process.env.GCS_REPORTS_SPREADSHEET_ID = '';
  console.log(`Piloto GCS: bucket ${process.env.GCS_BUCKET}, escopo ${process.env.GCS_OPERATION_SCOPE}.`);
  console.log('Relatorio permanecera pendente; envio ao Sheets desativado.');
  await import('./piloto-universal-vendas-gcs.js');
}
