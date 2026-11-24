//node src/crawlers/jfora/_check/jfCidades.js
// Lista todas as cidades gravadas em letras maiúsculas no Firestore
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import path from "path";
import { fileURLToPath } from "url";

// Inicialização segura do Firebase
if (!getApps().length) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const credPath = path.join(__dirname, "..", "..", "..", "..", "credentials", "firebase-key.json");
  initializeApp({
    credential: cert(credPath),
  });
}

const db = getFirestore();


/**
 * Busca registros com 'tipoImovel' em maiúsculas na coleção 'tipoImovel'.
 * @returns {Promise<Array>} - Lista de registros com tipoImovel em maiúsculas
 */
export async function listarTiposImovelMaiusculos() {
  const tiposMaiusculos = [];
  const snapshot = await db.collection("tipoImovel").get();
  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.tipoImovel && typeof data.tipoImovel === 'string' && data.tipoImovel === data.tipoImovel.toUpperCase()) {
      tiposMaiusculos.push({ ...data });
    }
  });
  return tiposMaiusculos;
}
