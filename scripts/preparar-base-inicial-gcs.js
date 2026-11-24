import { Storage } from '@google-cloud/storage';
import { JsonStorage } from '../src/infra/gcs/jsonStorage.js';
import { TransactionStore } from '../src/infra/gcs/transactionStore.js';
import { prepareInitialData } from '../src/infra/gcs/prepareInitialData.js';

const [backupId] = process.argv.slice(2);
const { GCS_BUCKET: bucketName, ACHOUIMOB_COMPUTER_ID: computerId } = process.env;
if (process.argv.length !== 3 || !backupId || !bucketName || !computerId) {
  console.error('Informe GCS_BUCKET, ACHOUIMOB_COMPUTER_ID e o identificador do backup.');
  process.exitCode = 1;
} else {
  try {
    const bucket = new Storage().bucket(bucketName);
    const transaction = new TransactionStore({
      storage: new JsonStorage({ bucket }),
      scope: 'base-preparacao-inicial',
      computerId,
    });
    const result = await prepareInitialData({
      bucket, transaction, backupId,
      progress: (done, total) => console.log(`Verificados ${done}/${total} arquivos originais.`),
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`Preparacao nao concluida: ${error.message}`);
    if (error instanceof AggregateError) {
      for (const cause of error.errors) console.error(`- ${cause.message}`);
    }
    process.exitCode = 1;
  }
}
