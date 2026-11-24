// Extrai o link da foto de um card HTML
// cardHtml: string (HTML do card)
import { JSDOM } from 'jsdom';
export function extractLinkFoto(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const img = dom.window.document.querySelector('a.listing-img-container img, a[href*="/imovel/"] img, img');
  if (!img) return '';
  const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
  if (!src) return '';
  return src.startsWith('http') ? src : `https://www.startimoveisjf.com.br${src.startsWith('/') ? '' : '/'}${src}`;
}
