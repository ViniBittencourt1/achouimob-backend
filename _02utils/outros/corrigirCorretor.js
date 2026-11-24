import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, cert, getApps } from "firebase-admin/app";

if (!getApps().length) {
  initializeApp({
    credential: cert("backend/credentials/firebase-key.json"),
  });
}

const db = getFirestore();

async function corrigirCorretor() {
  const snapshot = await db.collection("jfSenior").get();
  const batch = db.batch();

  snapshot.forEach(doc => {
    const data = doc.data();
    if (typeof data.corretor === "string" && data.corretor.trim()) {
      const primeiroNome = data.corretor.trim().split(/\s+/)[0];
      if (primeiroNome !== data.corretor) {
        batch.update(doc.ref, { corretor: primeiroNome });
      }
    }
  });

  await batch.commit();
  console.log("Corretores corrigidos!");
}

corrigirCorretor();
