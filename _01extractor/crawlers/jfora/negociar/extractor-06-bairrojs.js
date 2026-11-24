import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolverBairroCatalogo } from '../_utils/bairroCatalogo.js';

// Extrai o bairro do campo localizacao de um card HTML, aplica regra e busca slug no _jfBairros.json
export function extractBairro(cardHtml, cidade = '') {
  const dom = new JSDOM(cardHtml);
  const divLoc = dom.window.document.querySelector('div.imovel-item--localizacao');
  if (!divLoc) return '';
  let localizacao = divLoc.textContent.trim();
  // Normaliza para busca de "bairro"
  const localizacaoNorm = localizacao.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const match = localizacaoNorm.match(/bairro\s*([^,]*)/i);
  let resultado = '';
  if (match && match[1]) {
    // Extrai o valor após "bairro" e antes da vírgula
    resultado = match[1].trim();
  } else {
    // Se não houver "bairro", pega o valor inicial antes da vírgula
    resultado = localizacao.split(',')[0].trim();
  }
  // Normaliza o resultado para busca
  const bairroNormalizado = resultado.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[.,-]/g, ' ').replace(/\s+/g, ' ').trim();

  // Busca no _jfBairros.json
  const bairrosPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../../_03database/filtros/_jfBairros.json');
  let bairrosList = [];
  try {
    bairrosList = JSON.parse(fs.readFileSync(bairrosPath, 'utf8'));
  } catch (e) {
    // Se não conseguir ler, retorna o valor em maiúsculas
    return resultado.toUpperCase();
  }
  for (const item of bairrosList) {
    const nomeNorm = item.nome.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[.,-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (bairroNormalizado === nomeNorm) {
      return item.slug || item.nome;
    }
  }
  // Se não encontrar, retorna o valor pesquisado em maiúsculas
  return resolverBairroCatalogo(resultado, cidade);
}
