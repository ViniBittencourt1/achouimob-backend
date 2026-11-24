import { Storage } from '@google-cloud/storage';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInitialBackup } from '../src/infra/gcs/initialBackup.js';

const copyRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.dirname(copyRoot);
const [backupId] = process.argv.slice(2);
const bucketName = process.env.GCS_BUCKET;
const computerId = process.env.ACHOUIMOB_COMPUTER_ID;

if (process.argv.length !== 3 || !backupId || !bucketName || !computerId) {
  console.error('Informe GCS_BUCKET, ACHOUIMOB_COMPUTER_ID e o identificador do backup como argumento.');
  process.exitCode = 1;
} else {
  try {
    const result = await createInitialBackup({
      bucket: new Storage().bucket(bucketName),
      backupId,
      computerId,
      primaryRoot: path.join(projectRoot, 'backend'),
      copyRoot,
      logsParent: projectRoot,
    });
    console.log(JSON.stringify({
      backupId: result.backupId,
      originalFiles: result.originalFiles,
      copyDifferences: result.copyDifferences,
      invalidJson: result.invalidJson,
    }, null, 2));
  } catch (error) {
    console.error(`Backup nao concluido: ${error.message}`);
    process.exitCode = 1;
  }
}
