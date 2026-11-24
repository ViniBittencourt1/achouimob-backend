import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolverBairroCatalogo } from '../_utils/bairroCatalogo.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega a lista de bairros válidos (padrão centralizado)
const bairrosPath = path.resolve(__dirname, '../../../../_03database/filtros/_jfBairros.json');
let bairrosList = [];
try {
  bairrosList = JSON.parse(fs.readFileSync(bairrosPath, 'utf8'));
} catch (e) {
  bairrosList = [];
}

function normalizeText(text = '') {
  return String(text || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

function stripHtml(html = '') {
  return String(html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function findBairroSlugByName(nome, cidade = '') {
  const bairroNorm = normalizeText(nome);
  const cidadeSlug = String(cidade || '').trim();
  if (!bairroNorm) return '';

  const bairrosFiltrados = cidadeSlug
    ? bairrosList.filter((bairro) => String(bairro?.cidade || '').trim() === cidadeSlug)
    : bairrosList;

  const matches = [];
  for (const bairro of bairrosFiltrados) {
    const nomeNorm = normalizeText(bairro?.nome);
    if (!nomeNorm || !bairro?.slug) continue;

    const exact = bairroNorm === nomeNorm;
    const partial = nomeNorm.length >= 4 && (bairroNorm.includes(nomeNorm) || nomeNorm.includes(bairroNorm));
    if (exact || partial) {
      matches.push({
        slug: bairro.slug,
        principal: String(bairro.principal || 'sim').trim().toLowerCase() === 'sim',
        exact,
        length: nomeNorm.length,
      });
    }
  }

  if (!matches.length) return '';
  matches.sort((a, b) => Number(b.exact) - Number(a.exact) || Number(b.principal) - Number(a.principal) || b.length - a.length);
  return matches[0].slug;
}




// Função para extrair o bairro do HTML do card a partir do h2 de localização
function extrairBairroDoHtml(html) {
  // Regex para pegar o conteúdo do h2.card_split_vertically__location
  const regex = /<h2 class=\"card_split_vertically__location\">([^<]*)<\/h2>/i;
  const match = html.match(regex);
  if (match && match[1]) {
    // Extrai o texto antes do primeiro hífen
    const partes = match[1].split('-');
    if (partes.length > 0) {
      return partes[0].trim();
    }
    return match[1].trim();
  }
  return '';
}

function extrairBairroDoTitulo(cardHtml) {
  const tipoMatch = cardHtml.match(/<p[^>]*class=["'][^"']*card_split_vertically__type[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
  const localMatch = cardHtml.match(/<h2[^>]*class=["'][^"']*card_split_vertically__location[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i);
  const tipo = tipoMatch ? stripHtml(tipoMatch[1]) : '';
  const local = localMatch ? stripHtml(localMatch[1]) : '';
  const titulo = `${tipo} ${local}`.trim();
  if (!titulo) return '';

  const partes = titulo.split('-').map((item) => item.trim()).filter(Boolean);
  const primeiraParte = partes[0] || '';
  return primeiraParte.replace(new RegExp(`^${tipo}\\s+`, 'i'), '').trim() || primeiraParte;
}

export function extractBairroFromCardHtml(cardHtml, cidade = '') {
  const bairroExtraido = extrairBairroDoHtml(cardHtml);
  const bairroSlug = findBairroSlugByName(bairroExtraido, cidade);
  if (bairroSlug) return bairroSlug;

  const bairroTitulo = extrairBairroDoTitulo(cardHtml);
  const bairroSlugTitulo = findBairroSlugByName(bairroTitulo, cidade);
  if (bairroSlugTitulo) return bairroSlugTitulo;

  return resolverBairroCatalogo(bairroExtraido, cidade);
}

// Export padrão para compatibilidade antiga
export const extractBairro = extractBairroFromCardHtml;
