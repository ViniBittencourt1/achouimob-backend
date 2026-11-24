const admin = require('firebase-admin');
const path = require('path');
const { projectImovelForTypesense } = require('./projectImovelForTypesense.cjs');

const execute = process.argv.includes('--execute');
const backendRoot = path.join(__dirname, '..', '..');
const serviceAccount = require(path.join(backendRoot, 'credentials', 'firebase-key.json'));

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();
const FLOW_COLLECTIONS = /^jf[A-Za-z0-9]+(?:__backup)?$/;
const PUBLIC_COLLECTIONS = new Set(['__imoveisPublicos', '__imoveisPublicos__backup']);
const BATCH_SIZE = 400;

function isTypesenseFlowCollection(name) {
  return FLOW_COLLECTIONS.test(name) || PUBLIC_COLLECTIONS.has(name);
}

function sourceCollectionName(collectionName) {
  return collectionName.endsWith('__backup')
    ? collectionName.slice(0, -'__backup'.length)
    : collectionName;
}

async function cleanCollection(collectionName) {
  const snapshot = await db.collection(collectionName).get();
  let changed = 0;
  let removedFields = 0;
  let batch = null;

  for (const doc of snapshot.docs) {
    const data = doc.data() || {};
    const projected = projectImovelForTypesense(data, doc.id, sourceCollectionName(collectionName));
    const currentKeys = Object.keys(data);
    removedFields += currentKeys.filter((key) => !Object.prototype.hasOwnProperty.call(projected, key)).length;

    if (execute) {
      if (changed % BATCH_SIZE === 0) {
        if (changed > 0) await batch.commit();
        batch = db.batch();
      }
      batch.set(doc.ref, projected);
    }
    changed += 1;
  }

  if (execute && changed > 0) await batch.commit();
  return { documents: changed, removedFields };
}

async function main() {
  const collections = (await db.listCollections())
    .map((collection) => collection.id)
    .filter(isTypesenseFlowCollection)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));

  console.log(`${execute ? 'EXECUÇÃO' : 'SIMULAÇÃO'}: ${collections.length} coleções do fluxo Typesense.`);
  let totalDocuments = 0;
  let totalRemovedFields = 0;

  for (const collectionName of collections) {
    const result = await cleanCollection(collectionName);
    totalDocuments += result.documents;
    totalRemovedFields += result.removedFields;
    console.log(`${collectionName}: ${result.documents} documento(s), ${result.removedFields} campo(s) extra(s).`);
  }

  console.log(`${execute ? 'Concluído' : 'Nada foi alterado'}. Documentos: ${totalDocuments}. Campos removidos: ${totalRemovedFields}.`);
}

main()
  .catch((error) => {
    console.error(`Falha na limpeza: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => admin.app().delete().catch(() => {}));
