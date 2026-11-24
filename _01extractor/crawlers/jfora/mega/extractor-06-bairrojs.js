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
function extrairBairroSlugDoLink(link, cidade = 'juiz-de-fora-mg') {
  const cidadeSlug = String(cidade || 'juiz-de-fora-mg').toLowerCase();
  const escapedCidade = cidadeSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(link || '').match(new RegExp(`\\/imovel\\/[^/]*?-venda-([a-z0-9-]+)-${escapedCidade}\\/?$`, 'i'));
  return match?.[1] || '';
}

function extrairBairroDoHtml(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const titulo = doc.querySelector('.wpgb-block-11, h1')?.textContent?.replace(/\s+/g, ' ').trim() || '';
  const matchTitulo = titulo.match(/(?:no|na)\s+(.+?)\s+em\s+Juiz\s+de\s+Fora/i);
  if (matchTitulo?.[1]) {
    return matchTitulo[1].trim();
  }

  const loc = doc.querySelector('.wpgb-block-11, h3 a, h2 a, h4 a')?.textContent?.replace(/\s+/g, ' ').trim() || '';
  const matchLoc = loc.match(/(?:no|na)\s+(.+?)\s+em\s+Juiz\s+de\s+Fora/i);
  if (matchLoc?.[1]) {
    return matchLoc[1].trim();
  }

  const link = doc.querySelector('a.wpgb-card-layer-link[href*="/imovel/"], a[href*="/imovel/"]')?.getAttribute('href') || '';
  const bairroSlug = extrairBairroSlugDoLink(link);
  if (bairroSlug) {
    return bairroSlug;
  }

  return '';
}

export function extractBairroFromCardHtml(cardHtml, cidade = '') {
  const bairroExtraido = extrairBairroDoHtml(cardHtml);
  if (!bairroExtraido) return '';
  return resolverBairroCatalogo(bairroExtraido, cidade);
}

// Export padrão para compatibilidade antiga
export const extractBairro = extractBairroFromCardHtml;
