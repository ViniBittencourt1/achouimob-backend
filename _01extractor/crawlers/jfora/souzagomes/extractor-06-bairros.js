// extractor-06-bairros.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolverBairroCatalogo } from '../_utils/bairroCatalogo.js';

// Obter o caminho do diretório atual em ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega a lista de bairros válidos
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

/**
 * Extrai o nome do bairro a partir de uma string de localização e valida com a lista de bairros.
 * @param {string} localizacao - A string completa de localização.
 * @returns {string} O nome do bairro extraído (slug, nome ou capitalizado) ou uma string vazia se não for encontrado.
 */
export function extractBairro(localizacao, cidade = '') {
  if (!localizacao || typeof localizacao !== 'string') return '';

  let bairroExtraido = '';
  const matchBairro = localizacao.match(/bairro\s*(.*)/i);
  if (matchBairro && matchBairro[1]) {
    bairroExtraido = matchBairro[1].trim();
  } else {
    bairroExtraido = localizacao.trim(); // Se não encontrar o padrão 'bairro', usa a localização inteira
  }

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