// backend/deploy/services/firebase.js
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import path from "path";
import { fileURLToPath } from "url";

// Inicialização segura do Firebase
if (!getApps().length) {
  console.log("🔥 Inicializando conexão com Firebase...");
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const credPath = path.join(__dirname, "..", "..", "credentials", "firebase-key.json");
  initializeApp({
    credential: cert(credPath),
  });
}

const db = getFirestore();

/**
 * Carrega todos os documentos de uma coleção em um Map.
 * @param {string} collectionName - Nome da coleção.
 * @param {string} keyField - Campo a ser usado como chave no Map (ex: 'linkReal').
 * @returns {Promise<Map<string, object>>} Map dos documentos.
 */
export async function getCollectionAsMap(collectionName, keyField) {
  const existingDataMap = new Map();
  try {
    const snapshot = await db.collection(collectionName).get();
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      data.docId = doc.id; // Guarda o ID do documento para atualização
      if (data[keyField]) {
        existingDataMap.set(data[keyField], data);
      }
    });
  } catch (error) {
    console.error("❌ Erro ao carregar dados existentes do Firebase:", error);
  }
  return existingDataMap;
}

/**
 * Atualiza/cria documentos no Firebase usando batch.
 * @param {string} collectionName - Nome da coleção.
 * @param {Map<string, object>} dataMap - Map dos documentos a serem salvos.
 */
export async function batchUpdateFromMap(collectionName, dataMap) {
  const collection = db.collection(collectionName);
  const BATCH_SIZE = 400;
  let updateCount = 0;
  let newCount = 0;
  let batch = db.batch();
  let opCount = 0;
  let totalCount = 0;

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
}
