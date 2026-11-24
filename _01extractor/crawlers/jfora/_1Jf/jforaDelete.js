import { backendEnvPath as ISOLATED_BACKEND_ENV } from '../../../../backend-paths.cjs';
//node src/crawlers/jfora/_1Jf/jforaDelete.js


import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config({ path: ISOLATED_BACKEND_ENV });

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

// Coleções a serem apagadas (adicione/remova conforme necessário)
const COLECOES_PARA_APAGAR = [
  "jfACasas",
  "jfAcervo",
  "jfAlicerce",
  "jfAlmar",
  "jfAna",
  "jfBomClima",
  "jfClientt",
  "jfDecisao",
  "jfEstrelaSul",
  "jfEuro",
  "jfInvest",
  "jfJeferson",
  "jfLider",
  "jfLocal",
  "jfLocato",
  "jfMasson",
  "jfNegociar",
  "jfNogueira",
  "jfOliveira",
  "jfRVNegocios",
  "jfRedentor",
  "jfRemax",
  "jfRibeiroArrabal",
  "jfSelect",
  "jfSoares",
  "jfSouzaGomes",
  "jfToc2",
  "jfToronto",
  "jfUniversal",
  // ...adicione outras coleções aqui
];

async function deleteCollection(collectionName) {
  const snapshot = await db.collection(collectionName).get();
  if (snapshot.empty) {
    console.log(`[${collectionName}] Coleção vazia ou não encontrada.`);
    return;
  }
  const batchSize = 500;
  let deleted = 0;
  const docs = snapshot.docs;
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = db.batch();
    docs.slice(i, i + batchSize).forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    deleted += Math.min(batchSize, docs.length - i);
    console.log(`[${collectionName}] ${deleted}/${docs.length} documentos apagados...`);
  }
  console.log(`[${collectionName}] Todos os documentos apagados!`);
}

(async () => {
  for (const col of COLECOES_PARA_APAGAR) {
    try {
      await deleteCollection(col);
    } catch (err) {
      console.error(`[${col}] Erro ao apagar:`, err);
    }
  }
  process.exit(0);
})();
