// Script para atualizar o campo 'cidade' nos registros da coleção jfNogueira
// node scripts/atualizarCidade.cjs
// Edite as constantes CIDADE_ANTIGA e CIDADE_NOVA conforme necessário

const admin = require('firebase-admin');
const serviceAccount = require('../../credentials/firebase-key.json');

// Edite aqui o valor antigo e novo
const CIDADE_ANTIGA = 'juiz-de-fora';
const CIDADE_NOVA = 'juiz-de-fora-mg';

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function atualizarCidade() {
  const db = admin.firestore();
  const colecoes = ['jfNogueira', 'jfSouzaGomes'];
  for (const colecao of colecoes) {
    console.log(`Verificando coleção: ${colecao}`);
    const snapshot = await db.collection(colecao).where('cidade', '==', CIDADE_ANTIGA).get();
    if (snapshot.empty) {
      console.log(`Nenhum registro encontrado com cidade = ${CIDADE_ANTIGA} em ${colecao}`);
      continue;
    }
    let count = 0;
    for (const doc of snapshot.docs) {
      await doc.ref.update({ cidade: CIDADE_NOVA });
      count++;
    }
    console.log(`Atualizados ${count} registros de ${CIDADE_ANTIGA} para ${CIDADE_NOVA} em ${colecao}`);
  }
}

atualizarCidade();
