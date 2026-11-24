import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cidadesPath = path.resolve(__dirname, '../../../../_03database/filtros/_brCidades.json');

function loadCidadesList() {
  try {
    const data = JSON.parse(fs.readFileSync(cidadesPath, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

function normalize(str) {
  return String(str || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function slugify(text) {
  return normalize(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function stripHtml(html) {
  return String(html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function escapeRegExp(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findCidadeSlugInText(text, cidadesList) {
  const textNorm = normalize(text);
  if (!textNorm) return '';

  const cidadesOrdenadas = cidadesList
    .map((cidade) => ({ ...cidade, nomeNorm: normalize(cidade?.nome) }))
    .filter((cidade) => cidade.nomeNorm && cidade?.slug)
    .sort((a, b) => b.nomeNorm.length - a.nomeNorm.length);

  for (const cidade of cidadesOrdenadas) {
    const nomeNorm = cidade.nomeNorm;

    const regex = new RegExp(`(^|[^a-z0-9])${escapeRegExp(nomeNorm)}([^a-z0-9]|$)`, 'i');
    if (regex.test(textNorm)) {
      return cidade.slug;
    }
  }

  return '';
}

function findCidadeSlugInLinkReal(linkReal, cidadesList) {
  if (!linkReal) return '';

  let linkText = String(linkReal || '');
  try {
    linkText = decodeURIComponent(new URL(linkReal).pathname);
  } catch (e) {
    linkText = decodeURIComponent(linkText);
  }

  const slugPath = slugify(linkText.replace(/_/g, '-'));
  if (!slugPath) return '';

  const cidadesOrdenadas = cidadesList
    .map((cidade) => ({
      ...cidade,
      slugValue: String(cidade?.slug || '').trim(),
      slugSemEstado: String(cidade?.slug || '').trim().replace(/-[a-z]{2}$/i, ''),
      nomeSlug: slugify(cidade?.nome),
    }))
    .filter((cidade) => cidade.slugValue)
    .sort((a, b) => b.slugValue.length - a.slugValue.length);

  for (const cidade of cidadesOrdenadas) {
    const candidatos = [cidade.slugValue, cidade.slugSemEstado, cidade.nomeSlug].filter(Boolean);
    for (const candidato of candidatos) {
      const regex = new RegExp(`(^|-)${escapeRegExp(candidato)}(-|$)`, 'i');
      if (regex.test(slugPath)) {
        return cidade.slugValue;
      }
    }
  }

  return '';
}

function extractTituloText(cardHtml) {
  const match = cardHtml.match(/<p[^>]*class\s*=\s*(["'])product-title\1[^>]*>([\s\S]*?)<\/p>/i);
  return match ? stripHtml(match[2]) : '';
}

// Extrai a cidade do <span class="mb-sm-20">, busca no JSON de cidades
export function extractCidade(cardHtml, fallbackText = '', linkReal = '') {
  const cidadesList = loadCidadesList();
  const cidadeSlugFromLink = findCidadeSlugInLinkReal(linkReal, cidadesList);
  if (cidadeSlugFromLink) return cidadeSlugFromLink;
  if (!cardHtml || typeof cardHtml !== 'string') return '';
  const match = cardHtml.match(/<span[^>]*class\s*=\s*(["'])mb-sm-20\1[^>]*>([\s\S]*?)<\/span>/i);
  let rawText = '';
  if (match) {
    let text = stripHtml(match[2]);
    // Formata para "Santa Cruz, Juiz de Fora, Minas Gerais"
    text = text.toLowerCase().replace(/(^|, )([a-záéíóúãõâêîôûç]+)/g, (m, sep, word) => sep + word.charAt(0).toUpperCase() + word.slice(1));
    const cidadeSlug = findCidadeSlugInText(text, cidadesList);
    if (cidadeSlug) return cidadeSlug;
    rawText = text;
  }

  const titulo = extractTituloText(cardHtml);
  const cidadeSlugFromTitulo = findCidadeSlugInText(titulo || fallbackText, cidadesList);
  if (cidadeSlugFromTitulo) return cidadeSlugFromTitulo;

  return '';
}
// Export alternativo para compatibilidade com imports antigos
export const extractCidadeFromHtml = extractCidade;
