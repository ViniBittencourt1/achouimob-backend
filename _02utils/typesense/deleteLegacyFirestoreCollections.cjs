const admin = require('firebase-admin');
const path = require('path');

const execute = process.argv.includes('--execute');
const backendRoot = path.join(__dirname, '..', '..');
const serviceAccount = require(path.join(backendRoot, 'credentials', 'firebase-key.json'));

if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const keep = new Set(['__imoveisPublicos', '__imoveisPublicos__backup']);
const legacy = /^(?:jf[A-Za-z0-9]+(?:__backup)?|__bairrosUnicos|__cidadesUnicas|_bairrosUnicos|_banheirosUnicos|_cidadesUnicas|_dormitoriosUnicos|_tiposImoveisUnicos|_vagasUnicos)$/;
const batchSize = 400;

async function deleteCollection(name) {
  const snapshot = await db.collection(name).get();
  if (!execute) return snapshot.size;
  for (let index = 0; index < snapshot.docs.length; index += batchSize) {
    const batch = db.batch();
    snapshot.docs.slice(index, index + batchSize).forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
  return snapshot.size;
}

async function main() {
  const names = (await db.listCollections())
    .map((collection) => collection.id)
    .filter((name) => legacy.test(name) && !keep.has(name))
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  console.log(`${execute ? 'EXCLUSÃO' : 'SIMULAÇÃO'}: ${names.length} coleções legadas.`);
  let documents = 0;
  for (const name of names) {
    const count = await deleteCollection(name);
    documents += count;
    console.log(`${name}: ${count} documento(s).`);
  }
  console.log(`${execute ? 'Concluído' : 'Nada foi alterado'}. Coleções: ${names.length}. Documentos: ${documents}.`);
}

main().catch((error) => {
  console.error(`Falha: ${error.message}`);
  process.exitCode = 1;
}).finally(() => admin.app().delete().catch(() => {}));
