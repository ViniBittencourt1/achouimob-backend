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
 * Busca registros com o campo 'bairro' em maiúsculas na coleção 'bairro'.
 * @returns {Promise<Array>} - Lista de registros com bairro em maiúsculas
 */
export async function listarBairrosMaiusculos() {
  const snapshot = await db.collection("bairro").get();
  const bairrosMaiusculos = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.bairro && typeof data.bairro === 'string' && data.bairro === data.bairro.toUpperCase()) {
      bairrosMaiusculos.push({ ...data, _colecao: "bairro" });
    }
  });
  return bairrosMaiusculos;
}

// listarCidadesMaiusculas();
