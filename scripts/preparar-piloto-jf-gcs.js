import { JsonStorage } from '../src/infra/gcs/jsonStorage.js';
import { TransactionStore } from '../src/infra/gcs/transactionStore.js';
import { prepareJfSharedPilot } from '../src/infra/gcs/prepareJfSharedPilot.js';

const { GCS_BUCKET, GCS_OPERATION_SCOPE, ACHOUIMOB_COMPUTER_ID, ACHOUIMOB_ACTOR } = process.env;
const destinationScope = process.argv[2];
if (!GCS_BUCKET || !GCS_OPERATION_SCOPE || !ACHOUIMOB_COMPUTER_ID || !ACHOUIMOB_ACTOR ||
    !destinationScope || process.argv.length !== 3) {
  console.error('Informe bucket, escopo Universal, computador, operador e novo escopo compartilhado.');
  process.exitCode = 1;
} else {
  try {
    const storage = new JsonStorage({ bucketName: GCS_BUCKET });
    const transaction = scope => new TransactionStore({ storage, scope, computerId: ACHOUIMOB_COMPUTER_ID });
    const result = await prepareJfSharedPilot({
      source: transaction('base-preparacao-inicial'), universal: transaction(GCS_OPERATION_SCOPE),
      destination: transaction(destinationScope), actor: ACHOUIMOB_ACTOR,
      progress: (done, total) => console.log(`Documentos copiados e verificados: ${done}/${total}.`),
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`Preparacao do piloto compartilhado falhou: ${error.message}`);
    if (error instanceof AggregateError) for (const cause of error.errors) console.error(`- ${cause.message}`);
    process.exitCode = 1;
  }
}
