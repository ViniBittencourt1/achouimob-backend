// Extrai o link da foto de um card HTML
// cardHtml: string (HTML do card)
import { JSDOM } from 'jsdom';
export function extractLinkFoto(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const img = dom.window.document.querySelector('dd.foto-lista img, a[href*="/detalhes-imovel/"] img, img');
  if (!img) return '';
  const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
  if (!src) return '';
  return src.startsWith('http') ? src : `https://www.coutoguerraimoveis.com.br${src.startsWith('/') ? '' : '/'}${src}`;
}
