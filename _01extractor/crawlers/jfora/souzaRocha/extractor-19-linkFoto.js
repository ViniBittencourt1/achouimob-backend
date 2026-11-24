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
  // Busca o div com a classe post_thumbnail
  const thumb = doc.querySelector('div.post_thumbnail');
  if (thumb) {
    const style = thumb.getAttribute('style') || '';
    // Extrai a URL do background
    const match = style.match(/url\(['"]?([^'")]+)['"]?\)/);
    if (match && match[1]) {
      return match[1];
    }
  }
  // Fallback: busca a primeira imagem
  const img = doc.querySelector('img');
  if (img) {
    return img.getAttribute('data-src') || img.getAttribute('src') || '';
  }
  return '';
}
