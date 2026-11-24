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
  const cidadeSlug = String(cidade || '').trim();
  const bairrosFiltrados = cidadeSlug
    ? bairrosList.filter((bairro) => String(bairro?.cidade || '').trim() === cidadeSlug)
    : bairrosList;
  const matches = [];
  for (const bairro of bairrosFiltrados) {
    if (bairro.nome && bairro.slug && normalize(bairro.nome) === bairroNorm) {
      matches.push({
        slug: bairro.slug,
        principal: String(bairro.principal || 'sim').trim().toLowerCase() === 'sim'
      });
    }
  }
  if (matches.length) {
    matches.sort((a, b) => Number(b.principal) - Number(a.principal));
    return matches[0].slug;
  }
  // Se não encontrar, retorna o valor pesquisado em maiúsculas
  return resolverBairroCatalogo(bairroPesquisado, cidade);
}
