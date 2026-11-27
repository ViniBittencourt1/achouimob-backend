import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { JsonStorage } from '../src/infra/gcs/jsonStorage.js';
import { TransactionStore } from '../src/infra/gcs/transactionStore.js';
import { OperationalStore } from '../src/infra/gcs/operationalStore.js';
import { runAlicerceGcs } from '../_01extractor/crawlers/jfora/alicerce/gcs.js';

const configPath = fileURLToPath(new URL('../.env.piloto-jf', import.meta.url));
const config = dotenv.config({ path: configPath, override: true, quiet: true });
const required = ['GCS_BUCKET', 'GCS_OPERATION_SCOPE', 'ACHOUIMOB_COMPUTER_ID', 'ACHOUIMOB_ACTOR'];
const negotiation = process.argv[2];
const operationId = process.argv[3] || randomUUID();

if (config.error) {
  console.error(`Nao foi possivel carregar ${configPath}: ${config.error.message}`);
  process.exitCode = 1;
} else if (typeof global.gc !== 'function' || required.some(key => !config.parsed?.[key]?.trim()) ||
    !/^piloto-jf-compartilhado-[a-zA-Z0-9_-]+$/.test(process.env.GCS_OPERATION_SCOPE || '') ||
    !['venda', 'aluguel'].includes(negotiation) || process.argv.length > 4 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(operationId)) {
  console.error('Informe configuracao do piloto, node --expose-gc, negociacao e opcionalmente UUID valido.');
  process.exitCode = 1;
} else {
  console.log(`Piloto Alicerce: bucket ${process.env.GCS_BUCKET}, escopo ${process.env.GCS_OPERATION_SCOPE}.`);
  console.log(`Operacao: ${operationId}. Guarde este identificador para recuperacao.`);
  try {
    const transaction = new TransactionStore({
      storage: new JsonStorage({ bucketName: process.env.GCS_BUCKET }),
      scope: process.env.GCS_OPERATION_SCOPE, computerId: process.env.ACHOUIMOB_COMPUTER_ID,
    });
    const result = await runAlicerceGcs({
      store: new OperationalStore({ transaction }), actor: process.env.ACHOUIMOB_ACTOR,
      negociacao: negotiation, operationId,
    });
    console.log(JSON.stringify(result, null, 2));
    console.warn('Relatorio pendente; nenhum envio ao Sheets foi realizado.');
  } catch (error) {
    console.error(`Piloto nao concluido. Consulte a operacao ${operationId} no GCS antes de repetir: ${error.message}`);
    if (error instanceof AggregateError) for (const cause of error.errors) console.error(`- ${cause.message}`);
    process.exitCode = 1;
  }
}
