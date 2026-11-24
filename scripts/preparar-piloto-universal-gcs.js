import { JsonStorage } from '../src/infra/gcs/jsonStorage.js';
import { TransactionStore } from '../src/infra/gcs/transactionStore.js';
import { prepareUniversalPilot } from '../src/infra/gcs/prepareUniversalPilot.js';

const { GCS_BUCKET, GCS_OPERATION_SCOPE, ACHOUIMOB_COMPUTER_ID, ACHOUIMOB_ACTOR } = process.env;
if (!GCS_BUCKET || !GCS_OPERATION_SCOPE || !ACHOUIMOB_COMPUTER_ID || !ACHOUIMOB_ACTOR || process.argv.length !== 2) {
  console.error('Informe GCS_BUCKET, GCS_OPERATION_SCOPE, ACHOUIMOB_COMPUTER_ID e ACHOUIMOB_ACTOR.');
  process.exitCode = 1;
} else {
  try {
    const storage = new JsonStorage({ bucketName: GCS_BUCKET });
    const source = new TransactionStore({ storage, scope: 'base-preparacao-inicial', computerId: ACHOUIMOB_COMPUTER_ID });
    const destination = new TransactionStore({ storage, scope: GCS_OPERATION_SCOPE, computerId: ACHOUIMOB_COMPUTER_ID });
    console.log(JSON.stringify(await prepareUniversalPilot({ source, destination, actor: ACHOUIMOB_ACTOR }), null, 2));
  } catch (error) {
    console.error(`Preparacao do piloto nao concluida: ${error.message}`);
    if (error instanceof AggregateError) for (const cause of error.errors) console.error(`- ${cause.message}`);
    process.exitCode = 1;
  }
}
