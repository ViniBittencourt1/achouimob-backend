import { randomUUID } from 'node:crypto';
import { JsonStorage } from '../src/infra/gcs/jsonStorage.js';
import { TransactionStore } from '../src/infra/gcs/transactionStore.js';
import { OperationalStore } from '../src/infra/gcs/operationalStore.js';
import { runUniversalRentGcs } from '../_01extractor/crawlers/jfora/universal/gcsLocacao.js';

const { GCS_BUCKET, GCS_OPERATION_SCOPE, ACHOUIMOB_COMPUTER_ID, ACHOUIMOB_ACTOR } = process.env;
const operationId = process.argv[2] || randomUUID();
if (typeof global.gc !== 'function') {
  console.error('Inicie o piloto com node --expose-gc para limitar o uso de memoria.');
  process.exitCode = 1;
} else if (!GCS_BUCKET || !/^piloto-jf-compartilhado-[a-zA-Z0-9_-]+$/.test(GCS_OPERATION_SCOPE || '') ||
    !ACHOUIMOB_COMPUTER_ID || !ACHOUIMOB_ACTOR || process.argv.length > 3 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(operationId)) {
  console.error('Informe bucket, escopo compartilhado, computador, operador e opcionalmente UUID valido.');
  process.exitCode = 1;
} else {
  console.log(`Operacao: ${operationId}. Guarde este identificador para recuperacao.`);
  try {
    const transaction = new TransactionStore({
      storage: new JsonStorage({ bucketName: GCS_BUCKET }), scope: GCS_OPERATION_SCOPE, computerId: ACHOUIMOB_COMPUTER_ID,
    });
    const result = await runUniversalRentGcs({
      store: new OperationalStore({ transaction }), actor: ACHOUIMOB_ACTOR, operationId,
    });
    console.log(JSON.stringify(result, null, 2));
    console.warn('Relatorio pendente; nenhum envio ao Sheets foi realizado.');
  } catch (error) {
    console.error(`Piloto nao concluido. Consulte a operacao ${operationId} no GCS antes de repetir: ${error.message}`);
    if (error instanceof AggregateError) for (const cause of error.errors) console.error(`- ${cause.message}`);
    process.exitCode = 1;
  }
}
