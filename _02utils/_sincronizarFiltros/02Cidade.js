// Script para gerar cidades únicas a partir dos imóveis
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

async function gerarCidadesUnicas() {
    // Apaga todos os documentos anteriores da coleção _cidadesUnicas
    const cidadesUnicasSnapshot = await db.collection('_cidadesUnicas').get();
    const deleteBatch = db.batch();
    cidadesUnicasSnapshot.forEach(doc => {
      deleteBatch.delete(doc.ref);
    });
    if (!cidadesUnicasSnapshot.empty) {
      await deleteBatch.commit();
      console.log(`Apagados ${cidadesUnicasSnapshot.size} registros antigos de _cidadesUnicas.`);
    }
  console.log('==== INICIANDO SCRIPT DE CIDADES ÚNICAS ====');
  const imoveisSnapshot = await db.collection('__imoveisPublicos').get();
  const totalImoveis = imoveisSnapshot.size || imoveisSnapshot.docs.length;
  console.log(`Total de imóveis encontrados: ${totalImoveis}`);
  if (!totalImoveis) {
    console.error('Nenhum imóvel encontrado na coleção __imoveisPublicos!');
    return;
  }
  const cidadeSlugs = new Set();
  const contagemPorCidade = {};

  imoveisSnapshot.forEach(doc => {
    const data = doc.data();
    if (data.cidade) {
      cidadeSlugs.add(data.cidade);
      contagemPorCidade[data.cidade] = (contagemPorCidade[data.cidade] || 0) + 1;
    }
  });

  console.log(`Encontrados ${cidadeSlugs.size} slugs únicos:`, Array.from(cidadeSlugs));
  if (cidadeSlugs.size === 0) {
    console.error('Nenhum slug de cidade encontrado nos imóveis!');
    return;
  }
  const batch = db.batch();
  let count = 0;

  for (const slug of cidadeSlugs) {
    // Extrai nome formalizado e estado do slug
    let nomeCidade = slug;
    let estado = '';
    const partes = slug.split('-');
    if (partes.length > 1) {
      estado = partes[partes.length - 1].toUpperCase();
      nomeCidade = partes.slice(0, -1)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    } else {
      nomeCidade = slug.charAt(0).toUpperCase() + slug.slice(1);
    }

    // Tenta buscar nome na coleção _brCidade, mas prioriza nome formalizado
    const cidadeQuery = await db.collection('_brCidade').where('slug', '==', slug).limit(1).get();
    if (!cidadeQuery.empty) {
      // Se quiser priorizar nome do banco, descomente:
      // nomeCidade = cidadeQuery.docs[0].data().nome;
    } else {
      console.warn(`Slug não encontrado na coleção _brCidade: ${slug}. Usando slug para nome.`);
    }
    const newCityRef = db.collection('_cidadesUnicas').doc(slug);
    batch.set(newCityRef, {
      slug,
      nome: nomeCidade,
      estado,
      contagem: contagemPorCidade[slug]
    });
    console.log(`Salvando cidade: ${nomeCidade} (slug: ${slug}, estado: ${estado}, contagem: ${contagemPorCidade[slug]})`);
    count++;
  }

  await batch.commit();
  console.log(`Coleção _cidadesUnicas atualizada com ${count} cidades.`);
  console.log('==== FIM DO SCRIPT DE CIDADES ÚNICAS ====');
}

// Executa o script

// Execução direta do script ao rodar via Node
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    await initFirebase();
    await gerarCidadesUnicas();
  })();
}

export async function sincronizarCidadesUnicas() {
  await initFirebase();
  await gerarCidadesUnicas();
}
