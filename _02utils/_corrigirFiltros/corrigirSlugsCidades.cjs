// Script para validar e corrigir slugs de cidades na coleção _brCidade
// Ele verifica todos os slugs presentes em __imoveisPublicos e cria/atualiza na _brCidade se necessário

const admin = require('firebase-admin');
const serviceAccount = require('../../credentials/firebase-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function corrigirSlugsCidades() {
  const db = admin.firestore();
  // Busca todos os slugs de cidades dos imóveis
  const snapshotImoveis = await db.collection('__imoveisPublicos').get();
  const cidadesImoveis = new Set();
  snapshotImoveis.docs.forEach(doc => {
    const cidade = (doc.data().cidade || '').trim();
    if (cidade.length > 0) cidadesImoveis.add(cidade);
  });

  // Busca todos os slugs principais da coleção _brCidade
  const snapshotCidades = await db.collection('_brCidade').get();
  const cidadesPrincipais = new Map();
  snapshotCidades.docs.forEach(doc => {
    const data = doc.data();
    if (data.slug) {
      cidadesPrincipais.set(data.slug.trim(), { id: doc.id, principal: data.principal });
    }
  });

  let criados = 0;
  let atualizados = 0;
  let jaPrincipais = 0;
  for (const slug of cidadesImoveis) {
    const cidade = cidadesPrincipais.get(slug);
    if (!cidade) {
      // Cria novo registro na _brCidade marcando como principal
      await db.collection('_brCidade').add({ slug, principal: 'sim', nome: slug });
      criados++;
      console.log(`[CRIADO] slug: ${slug}`);
    } else if (cidade.principal !== 'sim') {
      // Atualiza registro existente para principal
      await db.collection('_brCidade').doc(cidade.id).update({ principal: 'sim' });
      atualizados++;
      console.log(`[ATUALIZADO] slug: ${slug}`);
    } else {
      jaPrincipais++;
    }
  }
  console.log(`Correção concluída! Criados: ${criados}, Atualizados: ${atualizados}, Já principais: ${jaPrincipais}`);
}

corrigirSlugsCidades();
