// Script para gerar bairros únicos a partir dos imóveis
// Requer: firebase-admin configurado




import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
let db;
async function initFirebase() {
  const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../credentials/firebase-key.json'), 'utf-8'));
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
  db = admin.firestore();
}

async function gerarBairrosUnicos() {
    // Apaga todos os documentos anteriores da coleção _bairrosUnicos
    const bairrosUnicosSnapshot = await db.collection('_bairrosUnicos').get();
    const deleteBatch = db.batch();
    bairrosUnicosSnapshot.forEach(doc => {
      deleteBatch.delete(doc.ref);
    });
    if (!bairrosUnicosSnapshot.empty) {
      await deleteBatch.commit();
      console.log(`Apagados ${bairrosUnicosSnapshot.size} registros antigos de _bairrosUnicos.`);
    }
  console.log('==== INICIANDO SCRIPT DE BAIRROS ÚNICOS ====');
  const imoveisSnapshot = await db.collection('__imoveisPublicos').get();
  const totalImoveis = imoveisSnapshot.size || imoveisSnapshot.docs.length;
  console.log(`Total de imóveis encontrados: ${totalImoveis}`);
  if (!totalImoveis) {
    console.error('Nenhum imóvel encontrado na coleção __imoveisPublicos!');
    return;
  }
  const bairrosUnicos = new Set();
  const contagemPorBairro = {};

  imoveisSnapshot.forEach(doc => {
    const data = doc.data();
    if (data.bairro) {
      bairrosUnicos.add(data.bairro);
      contagemPorBairro[data.bairro] = (contagemPorBairro[data.bairro] || 0) + 1;
    }
  });

  console.log(`Encontrados ${bairrosUnicos.size} bairros únicos:`, Array.from(bairrosUnicos));
  if (bairrosUnicos.size === 0) {
    console.error('Nenhum bairro encontrado nos imóveis!');
    return;
  }
  const batch = db.batch();
  let count = 0;

  for (const slugOrig of bairrosUnicos) {
    let slug = slugOrig && slugOrig.trim() ? slugOrig.trim() : 'nao-informado';
    // Firestore não permite '.', '/', etc. como ID de documento
    if (!slug || slug === '.' || slug.includes('/') || slug === '') {
      slug = 'nao-informado';
    }
    let nomeBairro = slug !== 'nao-informado'
      ? slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      : 'Não Informado';
    const newBairroRef = db.collection('_bairrosUnicos').doc(slug);
    batch.set(newBairroRef, {
      slug,
      nome: nomeBairro,
      contagem: contagemPorBairro[slugOrig]
    });
    console.log(`Salvando bairro: ${nomeBairro} (slug: ${slug}, contagem: ${contagemPorBairro[slugOrig]})`);
    count++;
  }

  await batch.commit();
  console.log(`Coleção _bairrosUnicos atualizada com ${count} bairros.`);
  console.log('==== FIM DO SCRIPT DE BAIRROS ÚNICOS ====');
  }


// Executa o script

// Execução direta do script ao rodar via Node
// Execução direta do script ao rodar via Node
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    await initFirebase();
    await gerarBairrosUnicos();
  })();
}

export async function sincronizarBairrosUnicos() {
  await initFirebase();
  await gerarBairrosUnicos();
}
