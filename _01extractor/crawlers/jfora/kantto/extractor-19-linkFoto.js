// Extrai o link da foto de um card HTML
// cardHtml: string (HTML do card)
import { JSDOM } from '../_utils/cachedJSDOM.js';
export function extractLinkFoto(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const img = dom.window.document.querySelector('a[href*="/imovel/"] img, img[class*="image-gallery-image"], img');
  if (!img) return '';
  const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
  if (!src) return '';
  return src.startsWith('http') ? src : `https://www.kanttoimoveis.com.br${src.startsWith('/') ? '' : '/'}${src}`;
}
