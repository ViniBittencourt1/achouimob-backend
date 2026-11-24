import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function normalizeText(text = '') {
  return String(text || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Extrai a cidade do primeiro <span style="color: #000000;"> dentro de <div class="rh_content"> e normaliza pelo JSON
export function extractCidade(cardHtml) {
  if (!cardHtml || typeof cardHtml !== 'string') return 'Juiz de Fora';
  // Extrai o conteúdo do primeiro <span style="color: #000000;"> dentro de <div class="rh_content">
  const match = cardHtml.match(/<div[^>]*class\s*=\s*(["'])rh_content\1[^>]*>[\s\S]*?<span[^>]*style\s*=\s*(["'])color:\s*#000000;\2[^>]*>([\s\S]*?)<\/span>/i);
  let cidadeExtraida = '';
  if (match) {
    let text = match[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    // Busca por "em <cidade>" e retorna a cidade
    const cidadeMatch = text.match(/em ([^,]+),?/i);
    if (cidadeMatch) {
      cidadeExtraida = cidadeMatch[1].trim();
    }
  }
  // Normaliza pelo JSON
  const cidadesPath = path.resolve(__dirname, '../../../../_03database/filtros/_brCidades.json');
  let cidadesList = [];
  try {
    cidadesList = JSON.parse(fs.readFileSync(cidadesPath, 'utf8'));
  } catch (e) {
    cidadesList = [];
  }
  for (const cidade of cidadesList) {
    if (cidadeExtraida && (normalizeText(cidadeExtraida) === normalizeText(cidade.nome) || normalizeText(cidadeExtraida) === normalizeText(cidade.slug))) {
      return cidade.slug || '';
    }
  }
  // Se não encontrar, retorna o valor extraído em maiúsculas ou 'juiz-de-fora-mg' se vazio
  return cidadeExtraida ? '' : 'juiz-de-fora-mg';
}
// Export alternativo para compatibilidade com imports antigos
export const extractCidadeFromHtml = extractCidade;
