// Diagnóstico de correspondência entre cidades de __imoveisPublicos e slugs de _brCidade
// node scripts/diagnosticoCidades.cjs
const admin = require('firebase-admin');
const serviceAccount = require('../../credentials/firebase-key.json');
const fs = require('fs');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function diagnosticoCidades() {
  const db = admin.firestore();
  // Busca todos os imóveis
  const snapshotImoveis = await db.collection('__imoveisPublicos').get();
  const cidadesImoveis = new Set();
  snapshotImoveis.docs.forEach(doc => {
    const cidade = (doc.data().cidade || '').trim();
    if (cidade.length > 0) cidadesImoveis.add(cidade);
  });

  // Busca todos os slugs principais da coleção _brCidade
  const snapshotCidades = await db.collection('_brCidade').get();
  const cidadesPrincipais = new Set();
  snapshotCidades.docs.forEach(doc => {
    const data = doc.data();
    if (data.principal === 'sim' && data.slug) {
      cidadesPrincipais.add(data.slug.trim());
    }
  });

  // Diagnóstico: cidades sem correspondência
  const naoEncontradas = [];
  cidadesImoveis.forEach(slug => {
    if (!cidadesPrincipais.has(slug)) {
      naoEncontradas.push(slug);
    }
  });

  // Salva relatório
  fs.writeFileSync('diagnostico_cidades_nao_encontradas.txt', naoEncontradas.join('\n'));
  console.log('Diagnóstico concluído! Veja o arquivo diagnostico_cidades_nao_encontradas.txt');
}

diagnosticoCidades();
