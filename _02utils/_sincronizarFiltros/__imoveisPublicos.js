import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const cidadesValidadas = new Set();
const cidadesCriadas = new Set();
let citySlugCatalogCache = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.join(__dirname, '..', '..');
const cityCatalogPath = path.join(backendRoot, '_03database', 'filtros', '_brCidades.json');

function normalizeSlug(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function loadCitySlugCatalog() {
  if (citySlugCatalogCache) {
    return citySlugCatalogCache;
  }

  const json = JSON.parse(fs.readFileSync(cityCatalogPath, 'utf8'));
  citySlugCatalogCache = new Set(
    json
      .filter((item) => item && typeof item.slug === 'string')
      .map((item) => item.slug.trim())
      .filter(Boolean)
  );

  return citySlugCatalogCache;
}

function linkPossuiJuizDeFora(linkReal) {
  const original = String(linkReal || '');
  if (!original) return false;

  let decoded = original;
  try {
    decoded = decodeURIComponent(original);
  } catch (err) {
    decoded = original;
  }

  const normalized = decoded
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return /juiz\s*de\s*fora/.test(normalized);
}

function linkPossuiRioDeJaneiro(linkReal) {
  const original = String(linkReal || '');
  if (!original) return false;

  let decoded = original;
  try {
    decoded = decodeURIComponent(original);
  } catch (err) {
    decoded = original;
  }

  const normalized = decoded
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return /rio\s*de\s*janeiro/.test(normalized);
}

function linkPossuiMatiasBarbosa(linkReal) {
  const original = String(linkReal || '');
  if (!original) return false;

  let decoded = original;
  try {
    decoded = decodeURIComponent(original);
  } catch (err) {
    decoded = original;
  }

  const normalized = decoded
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return /matias\s*barbosa/.test(normalized);
}

function linkPossuiPetropolis(linkReal) {
  const original = String(linkReal || '');
  if (!original) return false;

  let decoded = original;
  try {
    decoded = decodeURIComponent(original);
  } catch (err) {
    decoded = original;
  }

  const normalized = decoded
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return /petropolis/.test(normalized);
}

function textoPossuiCidade(texto, regex) {
  const original = String(texto || '');
  if (!original) return false;

  let decoded = original;
  try {
    decoded = decodeURIComponent(original);
  } catch (err) {
    decoded = original;
  }

  const normalized = decoded
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return regex.test(normalized);
}

function detectarCidadeCanonicaPorContexto(imovel) {
  const fontes = [imovel?.linkReal, imovel?.localizacao, imovel?.titulo];

  for (const fonte of fontes) {
    if (textoPossuiCidade(fonte, /matias\s*barbosa/)) return 'matias-barbosa-mg';
    if (textoPossuiCidade(fonte, /juiz\s*de\s*fora/)) return 'juiz-de-fora-mg';
    if (textoPossuiCidade(fonte, /rio\s*de\s*janeiro/)) return 'rio-de-janeiro-rj';
    if (textoPossuiCidade(fonte, /petropolis/)) return 'petropolis-rj';
  }

  return '';
}

function resolverCidadeComFallback(imovel) {
  const catalog = loadCitySlugCatalog();

  const cidadeCanonicaPorContexto = detectarCidadeCanonicaPorContexto(imovel);
  if (cidadeCanonicaPorContexto) {
    return cidadeCanonicaPorContexto;
  }

  const cidadeOriginal = String(imovel?.cidade || '').trim();
  if (cidadeOriginal && catalog.has(cidadeOriginal)) {
    return cidadeOriginal;
  }

  const cidadeNormalizada = normalizeSlug(cidadeOriginal);
  if (cidadeNormalizada && catalog.has(cidadeNormalizada)) {
    return cidadeNormalizada;
  }

  if (linkPossuiJuizDeFora(imovel?.linkReal)) {
    return 'juiz-de-fora-mg';
  }

  if (linkPossuiRioDeJaneiro(imovel?.linkReal)) {
    return 'rio-de-janeiro-rj';
  }

  if (linkPossuiMatiasBarbosa(imovel?.linkReal)) {
    return 'matias-barbosa-mg';
  }

  if (linkPossuiPetropolis(imovel?.linkReal)) {
    return 'petropolis-rj';
  }

  return cidadeNormalizada || cidadeOriginal;
}

function formatarNomeCidade(slugCidade) {
  if (!slugCidade) return '';

  return slugCidade
    .split('-')
    .map((parte) => {
      if (!parte) return parte;
      return parte.charAt(0).toUpperCase() + parte.slice(1);
    })
    .join(' ');
}

async function garantirCidadeUnica(db, slugCidade) {
  if (!slugCidade || cidadesValidadas.has(slugCidade) || cidadesCriadas.has(slugCidade)) {
    return;
  }

  const cidadeRef = db.collection('__cidadesUnicas').doc(slugCidade);
  const cidadeDoc = await cidadeRef.get();

  if (cidadeDoc.exists) {
    cidadesValidadas.add(slugCidade);
    return;
  }

  await cidadeRef.set(
    {
      slug: slugCidade,
      nome: formatarNomeCidade(slugCidade),
      principal: 'sim',
      origem: 'publishImoveisPublicos',
      atualizadoEm: new Date().toISOString(),
    },
    { merge: true }
  );

  cidadesCriadas.add(slugCidade);
  console.warn(`[PUBLICACAO] Cidade '${slugCidade}' criada automaticamente em __cidadesUnicas.`);
}

function normalizarLinkReal(linkReal) {
  return String(linkReal || '').trim();
}

function gerarIdPublico(imovel, imobiliariaId) {
  const linkReal = normalizarLinkReal(imovel?.linkReal);
  const base = linkReal || `${String(imovel?.id || '')}|${String(imobiliariaId || '')}`;
  return crypto.createHash('sha1').update(base).digest('hex');
}

/**
 * Replica um imóvel para a coleção __imoveisPublicos
 * @param {Object} imovel - Dados do imóvel
 * @param {string} imobiliariaId - ID da imobiliária de origem
 * @returns {Promise<void>}
 */
export async function replicarParaImoveisPublicos(imovel, imobiliariaId) {
  const db = getFirestore();
  if (!imovel || !imovel.id) throw new Error('Imóvel inválido ou sem ID');

  const linkRealNormalizado = normalizarLinkReal(imovel.linkReal);
  if (!linkRealNormalizado) {
    throw new Error('Imóvel sem linkReal');
  }

  const cidadeResolvida = resolverCidadeComFallback(imovel);
  const cidadeOriginal = String(imovel.cidade || '').trim();

  if (cidadeResolvida && cidadeResolvida !== cidadeOriginal) {
    console.log(
      `[PUBLICACAO] Fallback cidade aplicado para imóvel ${imovel.id} (${imobiliariaId}): ` +
      `'${cidadeOriginal || '(vazio)'}' -> '${cidadeResolvida}'`
    );
  }

  const imovelNormalizado = {
    ...imovel,
    linkReal: linkRealNormalizado,
    cidade: cidadeResolvida,
  };

  // Não bloqueia a replicação: garante cidade fallback quando ausente em __cidadesUnicas.
  if (imovelNormalizado.cidade) {
    await garantirCidadeUnica(db, imovelNormalizado.cidade);
  }

  const publicId = gerarIdPublico(imovelNormalizado, imobiliariaId);
  const publicRef = db.collection('__imoveisPublicos').doc(publicId);

  const docData = {
    ...imovelNormalizado,
    id: publicId,
    sourceDocId: String(imovelNormalizado.id),
    imobiliariaId,
    ...(imobiliariaId ? { origens: FieldValue.arrayUnion(imobiliariaId) } : {}),
    replicatedAt: new Date().toISOString(),
  };
  await publicRef.set(docData, { merge: true });
}

/**
 * Exemplo de uso:
 * import { replicarParaImoveisPublicos } from './__imoveisPublicos.js';
 * await replicarParaImoveisPublicos(imovel, 'jfInvest');
 */
