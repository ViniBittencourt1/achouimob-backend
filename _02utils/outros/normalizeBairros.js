import { backendRoot as ISOLATED_BACKEND_ROOT } from '../../backend-paths.cjs';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
// backend/utils/normalizeBairros.js
// para rodar no terminal: node utils/normalizeBairros.js
// Script para normalizar bairros, atualizar _jfBairros.json, Firestore e Sheets
import fs from 'fs';
import path from 'path';
import { batchUpdateFromMap, getCollectionAsMap } from '../../src/services/firebase.js';
import { exportToSheets, updateBairrosSheets, updateBrCidadesSheets } from '../src/crawlers/jfora/_bairros/jfBairros.js';

function slugify(nome) {
  if (!nome || typeof nome !== 'string') return '';
  return nome
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .replace(/\s+/g, '-');
}


function capitalizeWords(str) {
  return str
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/-/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// Carrega regras manuais de normalização
const regrasPath = path.resolve(__dirname, './normalizeBairrosRegras.json');
let regrasBairros = {};
if (fs.existsSync(regrasPath)) {
  try {
    regrasBairros = JSON.parse(fs.readFileSync(regrasPath, 'utf-8'));
  } catch (e) {
    console.warn('⚠️ Erro ao ler normalizeBairrosRegras.json:', e.message);
    regrasBairros = {};
  }
}

// Função para aplicar regra manual
function aplicarRegraManual(nome) {
  if (!nome) return nome;
  let nomeAtual = nome.trim();
  let nomeAnterior;
  // Aplica recursivamente até não mudar mais
  do {
    nomeAnterior = nomeAtual;
    // Busca case-insensitive e ignora acentos
    function normalizeKey(str) {
      return String(str)
        .normalize('NFD').replace(/\p{Diacritic}/gu, '')
        .toLowerCase().replace(/\s+/g, '');
    }
    const nomeNorm = normalizeKey(nomeAtual);
    const regra = Object.keys(regrasBairros).find(
      key => normalizeKey(key) === nomeNorm
    );
    nomeAtual = regra ? regrasBairros[regra] : nomeAtual;
  } while (nomeAtual !== nomeAnterior);
  return nomeAtual;
}

// Carrega bairros e cria mapa slug->obj
const bairrosPath = path.resolve(__dirname, '../crawler/_jfBairros.json');
const bairros = JSON.parse(fs.readFileSync(bairrosPath, 'utf-8'));
const bairrosMap = new Map();
// Aplica regra manual e capitalização ANTES de montar o map
bairros.forEach(b => {
  let nomeRegra = aplicarRegraManual(b.nome);
  nomeRegra = capitalizeWords(nomeRegra);
  const slug = slugify(nomeRegra);
  bairrosMap.set(slug, { ...b, nome: nomeRegra, slug });
});

// Carrega cidades e cria mapa slug-uf->cidadeId
const cidadesPath = path.resolve(__dirname, '../crawler/_brCidades.json');
const cidades = JSON.parse(fs.readFileSync(cidadesPath, 'utf-8'));
const cidadesMap = new Map();
cidades.forEach((c) => {
  // chave: slug(nome)-uf
  const key = `${slugify(c.uf)}-${slugify(c.nome)}`;
  cidadesMap.set(key, c.cidadeId || null);
});

// Função para encontrar cidadeId
function getCidadeId(nome, uf = 'MG') {
  if (!nome) return null;
  const key = `${slugify(uf)}-${slugify(nome)}`;
  return cidadesMap.get(key) || null;
}

// Função para normalizar um imóvel
function normalizaImovel(imovel) {
  // Bairro
  let bairroNome = imovel.bairro || '';
  bairroNome = aplicarRegraManual(bairroNome);
  bairroNome = capitalizeWords(bairroNome);
  const bairroSlug = slugify(bairroNome);
  const bairroObj = bairrosMap.get(bairroSlug);
  // Cidade
  // Se já vier slug, mantém, senão gera slug
  const cidadeSlug = imovel.cidadeSlug || (imovel.cidade ? slugify(imovel.cidade) : slugify('Juiz de Fora'));
  const cidadeId = getCidadeId(imovel.cidade || 'Juiz de Fora', 'MG');
  return {
    ...imovel,
    bairro: bairroObj ? bairroObj.nome : bairroNome,
    bairroId: bairroObj ? bairroObj.slug : null,
    cidade: cidadeSlug,
    cidadeId: cidadeId
  };
}

// Lista de arquivos de imóveis a normalizar
const arquivosImoveis = [
  '../crawler/jfACasas.json',
  '../crawler/jfInvest.json',
  '../crawler/jfRemax.json',
  '../crawler/jfRibeiroArrabal.json',
  '../crawler/jfSouzaGomes.json',
  '../crawler/jfRVNegocios.json',
  '../crawler/jfAlmar.json',
  '../crawler/jfEuro.json',
  '../crawler/jfAna.json',
  '../crawler/jfAlicerce.json',
  '../crawler/jfUniversal.json',
  '../crawler/jfLocato.json',
  '../crawler/jfClientt.json',
  '../crawler/jfSelect.json',
  '../crawler/jfNogueira.json',
  '../crawler/jfNegociar.json',
  '../crawler/jfRedentor.json',
  '../crawler/jfToronto.json',
  '../crawler/jfBomClima.json',
  '../crawler/jfAcervo.json',
  '../crawler/jfMasson.json',
  '../crawler/jfEstrelaSul.json',
  '../crawler/jfLocal.json',
  '../crawler/jfLider.json',
  '../crawler/jfDecisao.json',
  '../crawler/jfSoares.json',
  '../crawler/jfToc2.json',
  '../crawler/jfJeferson.json',
  '../crawler/jfOliveira.json',
  '../crawler/jfSouzaRocha.json',
  '../crawler/jfBellos.json',
  '../crawler/jfAntonioDias.json',
  '../crawler/jfJfImovel.json'

];


for (const fileRel of arquivosImoveis) {
  // Garante caminho absoluto para backend/crawler
  const nomeArquivo = fileRel.split('/').pop();
  const filePath = path.join(ISOLATED_BACKEND_ROOT, 'crawler', nomeArquivo);
  if (!fs.existsSync(filePath)) continue;
  let fileContent = fs.readFileSync(filePath, 'utf-8');
  if (!fileContent.trim()) {
    console.warn(`⚠️ ${fileRel} está vazio. Pulando.`);
    continue;
  }
  let arr;
  try {
    arr = JSON.parse(fileContent);
  } catch (e) {
    console.warn(`⚠️ Erro ao ler/parsing ${fileRel}: ${e.message}. Pulando.`);
    continue;
  }
  const arrNorm = arr.map(normalizaImovel);
  // Apenas leitura e normalização em memória, não salva _brCidades.json
  console.log(`✅ ${fileRel} normalizado com bairroId/cidadeId! (apenas em memória)`);
}



// Função para data/hora brasileira
function getDataHoraBR() {
  const timeZone = 'America/Sao_Paulo';
  const now = new Date();
  const zonedDate = toZonedTime(now, timeZone);
  return format(zonedDate, 'dd/MM/yyyy HH:mm:ss', { timeZone });
}



// Garante nomes únicos, capitalizados e com regra manual para bairros
const bairrosUnicosMap = new Map();
bairros.forEach(b => {
  let nomeRegra = aplicarRegraManual(b.nome);
  nomeRegra = aplicarRegraManual(nomeRegra); // Aplica novamente para casos encadeados
  nomeRegra = capitalizeWords(nomeRegra);
  const slug = slugify(nomeRegra);
  if (!bairrosUnicosMap.has(slug)) {
    bairrosUnicosMap.set(slug, {
      ...b,
      nome: nomeRegra,
      slug,
      atualizadoEm: getDataHoraBR(),
    });
  }
});
const bairrosNormalizados = Array.from(bairrosUnicosMap.values());
fs.writeFileSync(bairrosPath, JSON.stringify(bairrosNormalizados, null, 2), 'utf-8');
console.log('✅ _jfBairros.json normalizado e atualizado (únicos, capitalizados, regra manual e data/hora BR)!');

// Atualiza Firestore

(async () => {
  // Atualiza bairros no Firestore
  const COLLECTION_NAME = 'jfBairros';
  await batchUpdateFromMap(COLLECTION_NAME, new Map(bairrosNormalizados.map(b => [b.slug, b])));
  console.log('✅ Firestore atualizado com bairros normalizados!');

  // Atualiza imóveis nas coleções Firestore
  const colecoesImoveis = [
    'jfACasas',
    'jfInvest',
    'jfRemax',
    'jfRibeiroArrabal',
    'jfSouzaGomes',
    'jfRVNegocios',
    'jfAlmar',
    'jfEuro',
    'jfAna',
    'jfAlicerce',
    'jfUniversal',
    'jfLocato',
    'jfClientt',
    'jfSelect',
    'jfNogueira',
    'jfNegociar',
    'jfRedentor',
    'jfToronto',
    'jfBomClima',
    'jfAcervo',
    'jfMasson',
    'jfEstrelaSul',
    'jfLocal',
    "jfLider",
    "jfDecisao",
    "jfSoares",
    "jfToc2",
    "jfJeferson",
    "jfOliveira",
    "jfSouzaRocha",
    "jfBellos",
    "jfAntonioDias",
    "jfJfImovel"
  ];
  for (const col of colecoesImoveis) {
    const mapImoveis = await getCollectionAsMap(col, 'codigoBase');
    if (!mapImoveis.size) continue;
    const mapNorm = new Map();
    for (const [key, imovel] of mapImoveis.entries()) {
      const norm = normalizaImovel(imovel);
      mapNorm.set(key, norm);
    }
    await batchUpdateFromMap(col, mapNorm);
    console.log(`✅ Coleção Firestore ${col} normalizada com bairroId/cidadeId!`);
  }

  // Exporta bairros normalizados para o Google Sheets
  if (typeof updateBairrosSheets === 'function') {
    await updateBairrosSheets();
    console.log('✅ Exportação de bairros para Google Sheets concluída!');
  } else {
    console.log('⚠️ Não foi possível exportar bairros para o Google Sheets: função não encontrada.');
  }

  // Exporta cidades normalizadas para o Google Sheets
  if (typeof updateBrCidadesSheets === 'function') {
    await updateBrCidadesSheets();
    console.log('✅ Exportação de cidades para Google Sheets concluída!');
  } else {
    console.log('⚠️ Não foi possível exportar cidades para o Google Sheets: função não encontrada.');
  }
})();
