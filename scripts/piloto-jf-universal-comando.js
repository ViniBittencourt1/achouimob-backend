import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const configPath = fileURLToPath(new URL('../.env.piloto-jf', import.meta.url));
const config = dotenv.config({ path: configPath, override: true, quiet: true });
const required = ['GCS_BUCKET', 'GCS_OPERATION_SCOPE', 'ACHOUIMOB_COMPUTER_ID', 'ACHOUIMOB_ACTOR'];
const negotiation = process.argv[2];

if (config.error) {
  console.error(`Nao foi possivel carregar ${configPath}: ${config.error.message}`);
  process.exitCode = 1;
} else if (required.some(key => !config.parsed?.[key]?.trim()) ||
    !/^piloto-jf-compartilhado-[a-zA-Z0-9_-]+$/.test(process.env.GCS_OPERATION_SCOPE || '') ||
    !['venda', 'aluguel'].includes(negotiation)) {
  console.error(`Configure ${required.join(', ')} em ${configPath} e informe venda ou aluguel.`);
  process.exitCode = 1;
} else {
  process.env.GCS_REPORTS_SPREADSHEET_ID = '';
  process.argv.splice(2, 1);
  console.log(`Piloto compartilhado GCS: bucket ${process.env.GCS_BUCKET}, escopo ${process.env.GCS_OPERATION_SCOPE}.`);
  console.log('Relatorio permanecera pendente; envio ao Sheets desativado.');
  await import(negotiation === 'venda' ? './piloto-universal-vendas-gcs.js' : './piloto-universal-locacao-gcs.js');
}
