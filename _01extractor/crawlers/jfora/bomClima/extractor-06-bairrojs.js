import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolverBairroCatalogo, normalizarBairro } from '../_utils/bairroCatalogo.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega a lista de bairros válidos
const bairrosPath = path.resolve(__dirname, '../../../../_03database/filtros/_jfBairros.json');
let bairrosList = [];
try {
  bairrosList = JSON.parse(fs.readFileSync(bairrosPath, 'utf8'));
} catch (e) {
  bairrosList = [];
}




// Função para extrair o bairro do HTML da página interna usando breadcrumbs
import { JSDOM } from 'jsdom';
function extrairBairroDoHtml(html) {
  const dom = new JSDOM(html);
  const breadcrumb = dom.window.document.querySelectorAll('.breadcrumb li');
  // Busca o bairro no terceiro item do breadcrumb
  if (breadcrumb && breadcrumb.length >= 3) {
    const span = breadcrumb[2].querySelector("span[itemprop='name']");
    if (span) {
      return span.textContent.trim();
    }
  }
  return '';
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

export function extractBairroFromLinkReal(linkReal = '', cidade = '') {
  try {
    const parts = new URL(linkReal).pathname.split('/').filter(Boolean).map(part => decodeURIComponent(part));
    const uf = parts.at(-3);
    if (parts.length < 6 || !/^[a-z]{2}$/i.test(uf || '')) return '';
    const cidadeSlug = cidade || `${parts.at(-4)}-${uf}`.toLowerCase();
    const bairroSlug = normalizarBairro(parts.at(-2));
    const found = bairrosList.find(item => normalizarBairro(item.cidade) === normalizarBairro(cidadeSlug) && (normalizarBairro(item.slug) === bairroSlug || normalizarBairro(item.nome) === bairroSlug));
    return found?.slug || '';
  } catch { return ''; }
}

export function extractBairroFromCardHtml(cardHtml, cidade = '', linkReal = '') {
  if (!cidade && linkReal) {
    try {
      const parts = new URL(linkReal).pathname.split('/').filter(Boolean);
      if (/^[a-z]{2}$/i.test(parts.at(-3) || '')) cidade = `${parts.at(-4)}-${parts.at(-3)}`.toLowerCase();
    } catch {}
  }
  const bairroExtraido = extrairBairroDoHtml(cardHtml);
  if (!bairroExtraido) return extractBairroFromLinkReal(linkReal, cidade);
  // Busca o bairro extraído na lista de bairros
  for (const bairro of bairrosList) {
    if (
      bairro.nome &&
      (!cidade || normalizarBairro(bairro.cidade) === normalizarBairro(cidade)) &&
      bairroExtraido.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
        .includes(bairro.nome.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, ''))
    ) {
      return bairro.slug || bairro.nome; // Retorna o slug se existir, senão o nome
    }
  }
  const resolvido = resolverBairroCatalogo(bairroExtraido, cidade);
  const valido = resolvido && (!cidade || bairrosList.some(item => item.slug === resolvido && normalizarBairro(item.cidade) === normalizarBairro(cidade)));
  return valido ? resolvido : extractBairroFromLinkReal(linkReal, cidade);
}

// Export padrão para compatibilidade antiga
export const extractBairro = extractBairroFromCardHtml;
