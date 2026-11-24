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
 * Busca cidades em maiúsculas em qualquer coleção informada.
 * @param {string[]} colecoes - Lista de coleções a verificar
 * @returns {Promise<Array>} - Lista de registros com cidade em maiúsculas
 */
export async function listarCidadesMaiusculas(colecoes = ["cidades"]) {
  let cidadesMaiusculas = [];
  for (const colecao of colecoes) {
    const snapshot = await db.collection(colecao).get();
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.cidade && typeof data.cidade === 'string' && data.cidade === data.cidade.toUpperCase()) {
        cidadesMaiusculas.push({ ...data, _colecao: colecao });
      }
    });
  }
  return cidadesMaiusculas;
}

// listarCidadesMaiusculas();
