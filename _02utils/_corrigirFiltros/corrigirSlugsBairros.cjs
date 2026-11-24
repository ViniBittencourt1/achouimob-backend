// Script para validar e corrigir slugs de cidades na coleção _brCidade
// Ele verifica todos os slugs presentes em __imoveisPublicos e cria/atualiza na _brCidade se necessário

const admin = require('firebase-admin');
const serviceAccount = require('../../credentials/firebase-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function corrigirSlugsBairros() {
  const db = admin.firestore();
  // Busca todos os slugs de bairros dos imóveis
  const snapshotImoveis = await db.collection('__imoveisPublicos').get();
  const bairrosImoveis = new Set();
  snapshotImoveis.docs.forEach(doc => {
    const bairro = (doc.data().bairro || '').trim();
    if (bairro.length > 0) bairrosImoveis.add(bairro);
  });

  // Busca todos os slugs principais da coleção _jfBairro
  const snapshotBairros = await db.collection('_jfBairro').get();
  const bairrosPrincipais = new Map();
  snapshotBairros.docs.forEach(doc => {
    const data = doc.data();
    if (data.slug) {
      bairrosPrincipais.set(data.slug.trim(), { id: doc.id, principal: data.principal });
    }
  });

  let criados = 0;
  let atualizados = 0;
  let jaPrincipais = 0;
  for (const slug of bairrosImoveis) {
    const bairro = bairroPrincipais.get(slug);
    if (!bairro) {
      // Cria novo registro na _brCidade marcando como principal
      await db.collection('_jfBairro').add({ slug, principal: 'sim', nome: slug });
      criados++;
      console.log(`[CRIADO] slug: ${slug}`);
    } else if (bairro.principal !== 'sim') {
      // Atualiza registro existente para principal
      await db.collection('_jfBairro').doc(bairro.id).update({ principal: 'sim' });
      atualizados++;
      console.log(`[ATUALIZADO] slug: ${slug}`);
    } else {
      jaPrincipais++;
    }
  }
  console.log(`Correção concluída! Criados: ${criados}, Atualizados: ${atualizados}, Já principais: ${jaPrincipais}`);
}

corrigirSlugsBairros();
