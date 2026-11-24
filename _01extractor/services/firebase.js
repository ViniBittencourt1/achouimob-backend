import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import path from "path";
import { fileURLToPath } from "url";
import { applyManualJsonCorrectionsToDataMap } from "./crawlerJson.js";
export { getCollectionAsMap } from "./crawlerJson.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const canPublishCrawlerData = process.env.FIRESTORE_PUBLISH_JSON === "true";

// Inicialização segura do Firebase
if (!getApps().length) {
  console.log("🔥 Inicializando conexão com Firebase...");
  const credPath = path.join(__dirname, "..", "..", "credentials", "firebase-key.json"); // Caminho já correto para firebase-key.json
  // Corrigir caminho para service-account.json se necessário em outros pontos
  initializeApp({
    credential: cert(credPath),
  });
}

const db = getFirestore();

function isQuotaExceededError(error) {
  if (!error) return false;

  const message = String(error?.message || error?.details || "");
  const code = Number(error?.code ?? error?.status ?? 0);

  return code === 8 || /quota exceeded/i.test(message) || /RESOURCE_EXHAUSTED/i.test(message);
}

/**
 * Atualiza/cria documentos no Firebase usando batch.
 * @param {string} collectionName - Nome da coleção.
 * @param {Map<string, object>} dataMap - Map dos documentos a serem salvos.
 */
export async function batchUpdateFromMap(collectionName, dataMap) {
  if (!canPublishCrawlerData) {
    console.log(`⏸️ Firestore não atualizado para ${collectionName}: dados mantidos somente no JSON.`);
    return;
  }

  applyManualJsonCorrectionsToDataMap(collectionName, dataMap);

  const collection = db.collection(collectionName);
  const BATCH_SIZE = 400;
  let updateCount = 0;
  let newCount = 0;
  let batch = db.batch();
  let opCount = 0;
  let totalCount = 0;

  try {
    for (const imovel of dataMap.values()) {
      const dataToSave = { ...imovel };
      delete dataToSave.docId;

      if (imovel.docId) {
        batch.set(collection.doc(imovel.docId), dataToSave);
        updateCount++;
      } else {
        batch.set(collection.doc(), dataToSave);
        newCount++;
      }
      opCount++;
      totalCount++;
      if (opCount >= BATCH_SIZE) {
        await batch.commit();
        batch = db.batch();
        opCount = 0;
      }
    }
    if (opCount > 0) {
      await batch.commit();
    }
    console.log(`🔥 Firebase atualizado com sucesso. (Novos: ${newCount}, Atualizados/Excluídos: ${updateCount}, Total: ${totalCount})`);
    return { newCount, updateCount, totalCount };
  } catch (error) {
    if (isQuotaExceededError(error)) {
      console.warn(`⚠️ Firebase quota excedida ao salvar "${collectionName}". Ignorando gravação para evitar quebra do crawler.`);
      return;
    }
    throw error;
  }
}

export async function backupAndReplaceCollectionFromMap(collectionName, dataMap) {
  if (!canPublishCrawlerData) {
    console.log(`⏸️ Firestore não atualizado para ${collectionName}: dados mantidos somente no JSON.`);
    return;
  }

  applyManualJsonCorrectionsToDataMap(collectionName, dataMap);

  const collection = db.collection(collectionName);
  const backupCollection = db.collection(`${collectionName}__backup`);
  const sourceSnapshot = await collection.get();
  const backupSnapshot = await backupCollection.get();
  const BATCH_SIZE = 400;
  let batch = db.batch();
  let operationCount = 0;
  const commit = async () => {
    if (!operationCount) return;
    await batch.commit();
    batch = db.batch();
    operationCount = 0;
  };

  for (const doc of backupSnapshot.docs) {
    batch.delete(doc.ref);
    operationCount += 1;
    if (operationCount >= BATCH_SIZE) await commit();
  }
  for (const doc of sourceSnapshot.docs) {
    batch.set(backupCollection.doc(doc.id), doc.data());
    operationCount += 1;
    if (operationCount >= BATCH_SIZE) await commit();
  }
  await commit();

  const currentDocsByLink = new Map();
  for (const doc of sourceSnapshot.docs) {
    const linkReal = String(doc.data()?.linkReal || "").trim();
    if (linkReal && !currentDocsByLink.has(linkReal)) currentDocsByLink.set(linkReal, doc);
  }
  const publishedLinks = new Set();
  let published = 0;

  for (const [linkReal, imovel] of dataMap) {
    const normalizedLink = String(linkReal || "").trim();
    if (!normalizedLink) continue;
    const dataToSave = { ...imovel };
    delete dataToSave.docId;
    const currentDoc = currentDocsByLink.get(normalizedLink);
    batch.set(currentDoc ? currentDoc.ref : collection.doc(), dataToSave);
    publishedLinks.add(normalizedLink);
    published += 1;
    operationCount += 1;
    if (operationCount >= BATCH_SIZE) await commit();
  }
  for (const doc of sourceSnapshot.docs) {
    const linkReal = String(doc.data()?.linkReal || "").trim();
    if (linkReal && publishedLinks.has(linkReal) && currentDocsByLink.get(linkReal)?.id === doc.id) continue;
    batch.delete(doc.ref);
    operationCount += 1;
    if (operationCount >= BATCH_SIZE) await commit();
  }
  await commit();

  console.log(`FIRESTORE_BACKUP=${collectionName}__backup DOCS=${sourceSnapshot.size}`);
  console.log(`FIRESTORE_REPLACED=${collectionName} DOCS=${published}`);
  return { backupCount: sourceSnapshot.size, totalCount: published };
}

export async function deleteCollection(collectionName) {
  try {
    const snapshot = await db.collection(collectionName).get();

    if (snapshot.empty) {
      console.log(`ℹ️ Coleção '${collectionName}' já está vazia.`);
      return;
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    console.log(`🗑️ Coleção '${collectionName}' deletada do Firebase.`);
  } catch (error) {
    console.error("❌ Erro ao deletar coleção:", error);
  }
}
