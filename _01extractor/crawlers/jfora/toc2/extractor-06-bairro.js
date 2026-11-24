// Importa módulos necessários
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

// Obter o caminho do diretório atual em ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega a lista de bairros válidos (padrão centralizado)
const bairrosPath = path.resolve(__dirname, '../../../../_03database/filtros/_jfBairros.json');
let bairrosList = [];
try {
  bairrosList = JSON.parse(fs.readFileSync(bairrosPath, 'utf8'));
} catch (e) {
  console.error('Erro ao carregar a lista de bairros:', e.message);
  bairrosList = [];
}

function capitalizeWords(str) {
  return String(str)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/-/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function normalizeText(text = '') {
  return String(text || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function slugifyText(text = '') {
  return normalizeText(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function findBairroSlugByName(nomeBairro, cidade = '') {
  const bairroNormalizado = normalizeText(nomeBairro);
  const cidadeNormalizada = normalizeText(cidade);
  if (!bairroNormalizado) return '';

  const bairrosFiltrados = cidadeNormalizada
    ? bairrosList.filter((bairro) => normalizeText(bairro?.cidade) === cidadeNormalizada)
    : bairrosList;

  for (const bairro of bairrosFiltrados) {
    const nomeNormalizado = normalizeText(bairro?.nome);
    const slugNormalizado = normalizeText(bairro?.slug);
    if (nomeNormalizado && (bairroNormalizado.includes(nomeNormalizado) || bairroNormalizado === slugNormalizado)) {
      return bairro.slug || bairro.nome;
    }
  }

  return '';
}

function findBairroSlugInLinkReal(linkReal = '', cidade = '') {
  const rawLink = String(linkReal || '').trim();
  const cidadeSlug = String(cidade || '').trim();
  if (!rawLink || !cidadeSlug) return '';

  let pathname = rawLink;
  try {
    pathname = new URL(rawLink).pathname;
  } catch {}

  const segments = pathname
    .split('/')
    .map((segment) => slugifyText(decodeURIComponent(segment)))
    .filter(Boolean);

  const cidadeSegment = cidadeSlug.replace(/-[a-z]{2}$/i, '');
  const cidadeIndex = segments.findIndex((segment) => segment === cidadeSlug || segment === cidadeSegment);
  if (cidadeIndex < 0 || cidadeIndex + 1 >= segments.length) return '';

  const bairroSegment = segments[cidadeIndex + 1];
  const bairro = bairrosList.find((item) =>
    String(item?.cidade || '').trim() === cidadeSlug &&
    String(item?.slug || '').trim() === bairroSegment
  );

  return bairro?.slug || '';
}

// Extrai o campo bairro de um card HTML e valida com a lista de bairros
// cardHtml: string (HTML do card)
export function extractBairro(cardHtml, linkReal = '', cidade = '') {
  if ((!cardHtml || typeof cardHtml !== 'string') && !linkReal) return '';

  const dom = new JSDOM(cardHtml);
  const nodes = dom.window.document.querySelectorAll('div.HistoryComponent_text_normal__6ot8a');
  let bairroExtraido = '';

  if (nodes.length >= 5) {
    bairroExtraido = nodes[4].textContent.trim();
  }

  if (!bairroExtraido) {
    return findBairroSlugInLinkReal(linkReal, cidade);
  }

  // Busca o bairro extraído na lista de bairros
  const bairroSlug = findBairroSlugByName(bairroExtraido, cidade);
  if (bairroSlug) return bairroSlug;

  const bairroSlugFromLink = findBairroSlugInLinkReal(linkReal, cidade);
  if (bairroSlugFromLink) return bairroSlugFromLink;

  // Se não encontrar, retorna o nome extraído em maiúsculas
  return '';
}

// Export alternativo para compatibilidade com imports antigos
export const extractBairroFromTitulo = extractBairro;