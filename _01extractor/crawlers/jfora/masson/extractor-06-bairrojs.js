import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';


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



// Função para extrair o bairro do HTML do card a partir do h2 de localização
function extrairBairroDoHtml(html) {
  // Regex para pegar o conteúdo do h2.card-with-buttons__heading, ignorando <p> interno
  const regex = /<h2 class="card-with-buttons__heading">([^<]*)/i;
  const match = html.match(regex);
  if (match && match[1]) {
    // Extrai o texto antes do primeiro hífen
    const partes = match[1].split(' -');
    if (partes.length > 0) {
      return partes[0].trim();
    }
    return match[1].trim();
  }
  return '';
}

function normalizeText(text = '') {
  return String(text || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
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

    if (bairroNorm === nomeNorm || bairroNorm.includes(nomeNorm) || nomeNorm.includes(bairroNorm)) {
      matches.push({
        slug: bairro.slug,
        principal: String(bairro.principal || 'sim').trim().toLowerCase() === 'sim',
        length: nomeNorm.length,
      });
    }
  }

  if (!matches.length) return '';
  matches.sort((a, b) => Number(b.principal) - Number(a.principal) || b.length - a.length);
  return matches[0].slug;
}

export function extractBairroFromCardHtml(cardHtml, cidade = '') {
  const bairroExtraido = extrairBairroDoHtml(cardHtml);
  if (!bairroExtraido) return '';

  const bairroSlug = findBairroSlugByName(bairroExtraido, cidade);
  if (bairroSlug) return bairroSlug;

  return bairroExtraido.toUpperCase();
}

// Export padrão para compatibilidade antiga
export const extractBairro = extractBairroFromCardHtml;
