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



// Função para extrair o bairro do HTML do card a partir da div de localização
function extrairBairroDoHtml(html) {
  // Regex para pegar o conteúdo da div de localização
  const regex = /<div class="imovel-item--localizacao[^"]*">\s*([^,<]*)/i;
  const match = html.match(regex);
  if (match && match[1]) {
    let localizado = match[1].trim();
    // Normaliza para facilitar busca
    const norm = localizado.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    const idxBairro = norm.indexOf('bairro');
    if (idxBairro !== -1) {
      // Pega o trecho após 'bairro'
      const afterBairro = localizado.slice(idxBairro + 'bairro'.length);
      // Pega até a próxima vírgula
      const matchBairro = afterBairro.match(/([^,]*)/);
      return matchBairro ? matchBairro[1].trim() : afterBairro.trim();
    } else {
      // Se não encontrar 'bairro', retorna o valor anterior à vírgula
      return localizado.split(',')[0].trim();
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

export function extractBairroFromCardHtml(cardHtml, cidade = '') {
  const bairroExtraido = extrairBairroDoHtml(cardHtml);
  if (!bairroExtraido) return '';
  // Busca o bairro extraído na lista de bairros
  for (const bairro of bairrosList) {
    if (
      bairro.nome &&
      bairroExtraido.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
        .includes(bairro.nome.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, ''))
    ) {
      return bairro.slug || bairro.nome; // Retorna o slug se existir, senão o nome
    }
  }
  // Se não encontrar, retorna o nome extraído em maiúsculas
  return resolverBairroCatalogo(bairroExtraido, cidade);
}

// Export padrão para compatibilidade antiga
export const extractBairro = extractBairroFromCardHtml;
