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

// Função para normalizar texto
function normalize(str) {
  return str.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

import { JSDOM } from 'jsdom';

// Extrai o bairro conforme a lógica solicitada
export function extractBairro(cardHtml, cidade = '') {
  const dom = new JSDOM(cardHtml);
  const divLoc = dom.window.document.querySelector('div.imovel-item--localizacao');
  if (!divLoc) return '';
  const text = divLoc.textContent.trim();
  const normText = normalize(text);
  let bairroPesquisado = '';
  const idxBairro = normText.indexOf('bairro');
  if (idxBairro !== -1) {
    // Pega o trecho após 'bairro'
    const afterBairro = text.slice(idxBairro + 'bairro'.length);
    // Pega até a próxima vírgula
    const match = afterBairro.match(/([^,]*)/);
    bairroPesquisado = match ? match[1].trim() : afterBairro.trim();
  } else {
    // Se não encontrar 'bairro', retorna o valor anterior à vírgula
    bairroPesquisado = text.split(',')[0].trim();
  }
  // Normaliza para busca
  const bairroNorm = normalize(bairroPesquisado);
  for (const bairro of bairrosList) {
    if (normalize(bairro.nome) === bairroNorm) {
      return bairro.slug;
    }
  }
  // Se não encontrar, retorna o valor pesquisado em maiúsculas
  return resolverBairroCatalogo(bairroPesquisado, cidade);
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
