//backend/utils/corrigirPrecos.js


import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, cert, getApps } from "firebase-admin/app";

if (!getApps().length) {
  initializeApp({
    credential: cert("backend/credentials/firebase-key.json"),
  });
}

const db = getFirestore();

async function corrigirPrecos() {
  const snapshot = await db.collection("jfSenior").get();
  const batch = db.batch();

  snapshot.forEach(doc => {
    const data = doc.data();
    if (typeof data.preco === "string") {
      // Remove R$, pontos, espaços e valores após a vírgula
      let novoPreco = data.preco.replace(/R\$|\.|\s/g, "");
      if (novoPreco.includes(",")) {
        novoPreco = novoPreco.split(",")[0];
      }
      if (novoPreco !== data.preco) {
        batch.update(doc.ref, { preco: novoPreco });
      }
    }
  });

  await batch.commit();
  console.log("Preços corrigidos!");
}

corrigirPrecos();