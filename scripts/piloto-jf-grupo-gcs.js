import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { JsonStorage } from '../src/infra/gcs/jsonStorage.js';
import { TransactionStore } from '../src/infra/gcs/transactionStore.js';
import { OperationalStore } from '../src/infra/gcs/operationalStore.js';
import { projetoJfGcs, projetosJfGcs, runProjetoJfGcs } from '../_01extractor/crawlers/jfora/_utils/jfGrupoGcs.js';

const configPath = fileURLToPath(new URL('../.env.piloto-jf', import.meta.url));
const config = dotenv.config({ path: configPath, override: true, quiet: true });
const required = ['GCS_BUCKET', 'GCS_OPERATION_SCOPE', 'ACHOUIMOB_COMPUTER_ID', 'ACHOUIMOB_ACTOR'];
const [name, negotiation] = process.argv.slice(2);
try {
  if (config.error) throw config.error;
  if (typeof global.gc !== 'function' || required.some(key => !config.parsed?.[key]?.trim()) ||
      !/^piloto-jf-compartilhado-[a-zA-Z0-9_-]+$/.test(process.env.GCS_OPERATION_SCOPE || '') ||
      !['venda', 'aluguel'].includes(negotiation) || process.argv.length !== 4) {
    throw new Error('Use jf:gcs -- <projeto|adaptados> <venda|aluguel> com configuracao do piloto.');
  }
  const projects = name === 'adaptados' ? projetosJfGcs : [projetoJfGcs(name)];
  const transaction = new TransactionStore({
    storage: new JsonStorage({ bucketName: process.env.GCS_BUCKET }),
    scope: process.env.GCS_OPERATION_SCOPE, computerId: process.env.ACHOUIMOB_COMPUTER_ID,
  });
  const store = new OperationalStore({ transaction });
  for (const projeto of projects) {
    const operationId = randomUUID();
    console.log(`[${projeto}] Operacao ${operationId}; guarde o UUID para recuperacao.`);
    try {
      const result = await runProjetoJfGcs({ projeto, negociacao: negotiation, operationId, store, actor: process.env.ACHOUIMOB_ACTOR });
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      throw new Error(`[${projeto}] Falha na operacao ${operationId}; consulte o GCS antes de repetir: ${error.message}`, { cause: error });
    }
  }
  console.log('Relatorios pendentes; nenhum envio ao Sheets ou Typesense foi realizado.');
} catch (error) {
  console.error(error.message);
  if (error instanceof AggregateError) for (const cause of error.errors) console.error(`- ${cause.message}`);
  process.exitCode = 1;
}
