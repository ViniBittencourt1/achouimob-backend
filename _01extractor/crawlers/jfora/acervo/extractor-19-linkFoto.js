import { JSDOM } from 'jsdom';

// Retorna a data de exclusão do linkReal no banco de dados
export function getDataExclusao() {
  return new Date().toISOString();
}

// Extrai a foto principal do card/página (prioriza data-fullsize, depois data-fallback, depois src)
export function extractLinkFoto(html) {
  if (!html || typeof html !== 'string') return '';
  const dom = new JSDOM(html);
  const img = dom.window.document.querySelector('img[data-fullsize], img[data-fallback], img[src]');
  if (!img) return '';
  return img.getAttribute('data-fullsize') || img.getAttribute('data-fallback') || img.getAttribute('src') || '';
}
