import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolverBairroCatalogo } from '../_utils/bairroCatalogo.js';


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

function normalizeText(text = '') {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractBairroFromLink(linkReal = '') {
  try {
    const pathname = new URL(linkReal).pathname;
    return pathname.match(/\/imovel\/[^/]+\/[^/]+\/[^/]+\/[^/]+\/([^/]+)\//i)?.[1] || '';
  } catch {
    return '';
  }
}

export function extractBairroFromCardHtml(cardHtml, cidade = '', linkReal = '') {
  const bairroExtraido = extrairBairroDoHtml(cardHtml);
  const candidatos = bairrosList.filter((bairro) =>
    String(bairro?.principal || 'sim').trim().toLowerCase() === 'sim' &&
    (!cidade || String(bairro?.cidade || '').trim() === cidade)
  );
  const buscarNoCatalogo = (valor) => {
    const normalizado = normalizeText(valor);
    if (!normalizado) return '';
    return candidatos.find((bairro) => normalizeText(bairro.nome) === normalizado || normalizeText(bairro.slug) === normalizado)?.slug || '';
  };

  const bairroDoLink = extractBairroFromLink(linkReal);
  const slugDoLink = buscarNoCatalogo(bairroDoLink);
  if (slugDoLink) return slugDoLink;

  const slugDoHtml = buscarNoCatalogo(bairroExtraido);
  if (slugDoHtml) return slugDoHtml;

  return resolverBairroCatalogo(bairroExtraido || bairroDoLink, cidade);
}

// Export padrão para compatibilidade antiga
export const extractBairro = extractBairroFromCardHtml;
