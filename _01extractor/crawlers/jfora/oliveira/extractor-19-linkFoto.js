// Retorna a data de exclusão do linkReal no banco de dados
// Deve ser preenchida quando o linkReal não for mais encontrado
export function getDataExclusao() {
  return new Date().toISOString();
}

// Extrai o link da foto de um card HTML
// cardHtml: string (HTML do card)

import { JSDOM } from 'jsdom';
export function extractLinkFoto(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const doc = dom.window.document;
  // Busca a primeira imagem do HTML
  const img = doc.querySelector('img');
  if (img) {
    // Prioriza data-src se existir, senão usa src
    return img.getAttribute('data-src') || img.getAttribute('src') || '';
  }
  return '';
}
