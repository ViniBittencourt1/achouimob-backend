// Diagnóstico de correspondência entre cidades de __imoveisPublicos e slugs de _brCidade
// node _02utils/_corrigirFiltros/01checkarEntradas.js
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../credentials/firebase-key.json'), 'utf-8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function diagnosticoCidades() {
  const db = admin.firestore();
  // Busca todas as coleções que começam com 'jf'
  const allCollections = await db.listCollections();
  const jfCollections = allCollections.filter(col => col.id.startsWith('jf'));
  let imoveisDocs = [];
  for (const col of jfCollections) {
    const snapshot = await col.get();
    snapshot.docs.forEach(doc => {
      // Adiciona o nome da coleção ao documento
      imoveisDocs.push({ doc, collection: col.id });
    });
  }

  // Substitui snapshotImoveis.docs por imoveisDocs nas etapas
  const cidadesImoveis = new Map();
  imoveisDocs.forEach(({ doc, collection }) => {
    const cidade = (doc.data().cidade || '').trim();
    if (cidade.length > 0) {
      if (!cidadesImoveis.has(cidade)) cidadesImoveis.set(cidade, new Set());
      cidadesImoveis.get(cidade).add(collection);
    }
  });

  // Busca todos os slugs principais do arquivo _brCidades.json
  const cidadesPath = path.resolve(__dirname, '../../_03database/filtros/_brCidades.json');
  const cidadesRaw = fs.readFileSync(cidadesPath, 'utf-8');
  const cidadesJson = JSON.parse(cidadesRaw);
  const cidadesPrincipais = new Set();
  cidadesJson.forEach(cidadeObj => {
    if (cidadeObj.principal === 'sim' && cidadeObj.slug) {
      cidadesPrincipais.add(cidadeObj.slug.trim());
    }
  });

  // Diagnóstico: cidades sem correspondência
  const naoEncontradas = [];
  cidadesImoveis.forEach((collections, slug) => {
    if (!cidadesPrincipais.has(slug)) {
      naoEncontradas.push(`${slug} | ${Array.from(collections).join(',')}`);
    }
  });

  fs.writeFileSync('diagnostico_cidades_nao_encontradas.txt', naoEncontradas.join('\n'));
  console.log('Cidades não encontradas:', naoEncontradas);

  // ETAPA 2: Diagnóstico de bairros
  const bairrosPath = path.resolve(__dirname, '../../_03database/filtros/_jfBairros.json');
  const bairrosRaw = fs.readFileSync(bairrosPath, 'utf-8');
  const bairrosJson = JSON.parse(bairrosRaw);
  const bairrosPrincipais = new Set();
  bairrosJson.forEach(bairroObj => {
    if (bairroObj.slug) {
      bairrosPrincipais.add(bairroObj.slug.trim());
    }
  });

  const bairrosImoveis = new Map();
  imoveisDocs.forEach(({ doc, collection }) => {
    const bairro = (doc.data().bairro || '').trim();
    if (bairro.length > 0) {
      if (!bairrosImoveis.has(bairro)) bairrosImoveis.set(bairro, new Set());
      bairrosImoveis.get(bairro).add(collection);
    }
  });

  const bairrosNaoEncontrados = [];
  bairrosImoveis.forEach((collections, slug) => {
    if (!bairrosPrincipais.has(slug)) {
      bairrosNaoEncontrados.push(`${slug} | ${Array.from(collections).join(',')}`);
    }
  });

  fs.writeFileSync('diagnostico_bairros_nao_encontrados.txt', bairrosNaoEncontrados.join('\n'));
  console.log('Bairros não encontrados:', bairrosNaoEncontrados);

  // ETAPA 3: Diagnóstico de tipos de imóvel
  const tiposPath = path.resolve(__dirname, '../../_03database/filtros/_brTipoImovel.json');
  const tiposRaw = fs.readFileSync(tiposPath, 'utf-8');
  let tiposJson = JSON.parse(tiposRaw);
  let tiposArray = [];
  if (Array.isArray(tiposJson)) {
    tiposArray = tiposJson;
  } else if (tiposJson.tiposFiltro && Array.isArray(tiposJson.tiposFiltro)) {
    tiposArray = tiposJson.tiposFiltro;
  } else if (tiposJson.tiposFiltro && typeof tiposJson.tiposFiltro === 'object') {
    // Caso tiposFiltro seja um objeto de arrays
    Object.values(tiposJson.tiposFiltro).forEach(arr => {
      if (Array.isArray(arr)) tiposArray = tiposArray.concat(arr);
    });
  }
  const tiposPrincipais = new Set();
  tiposArray.forEach(tipoObj => {
    if (tipoObj.slug) {
      tiposPrincipais.add(tipoObj.slug.trim());
    }
  });

  const tiposImoveis = new Map();
  imoveisDocs.forEach(({ doc, collection }) => {
    const tipo = (doc.data().tipoImovel || '').trim();
    if (tipo.length > 0) {
      if (!tiposImoveis.has(tipo)) tiposImoveis.set(tipo, new Set());
      tiposImoveis.get(tipo).add(collection);
    }
  });

  const tiposNaoEncontrados = [];
  tiposImoveis.forEach((collections, slug) => {
    if (!tiposPrincipais.has(slug)) {
      tiposNaoEncontrados.push(`${slug} | ${Array.from(collections).join(',')}`);
    }
  });

  fs.writeFileSync('diagnostico_tipos_nao_encontrados.txt', tiposNaoEncontrados.join('\n'));
  console.log('Tipos de imóvel não encontrados:', tiposNaoEncontrados);

  // ETAPA 4: Diagnóstico de valores não numéricos
  const camposNumericos = [
    'dormitorioValor',
    'garagemValor',
    'banheiroValor',
    'areaValor',
    'preco'
  ];

  const valoresNaoNumericos = [];
  imoveisDocs.forEach(({ doc, collection }) => {
    const data = doc.data();
    camposNumericos.forEach(campo => {
      const valor = data[campo];
      if (valor !== undefined && (typeof valor !== 'number' || isNaN(valor))) {
        valoresNaoNumericos.push(`${campo}: ${valor} | ${collection}`);
      }
    });
  });

  fs.writeFileSync('diagnostico_valores_nao_numericos.txt', valoresNaoNumericos.join('\n'));
  console.log('Valores não numéricos encontrados:', valoresNaoNumericos);
}

diagnosticoCidades();
