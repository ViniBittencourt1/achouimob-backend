// Extrai o link da foto de um card HTML
// cardHtml: string (HTML do card)
import { JSDOM } from 'jsdom';
export function extractLinkFoto(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const img = dom.window.document.querySelector('a.col.imovelcard__img > img');
  return img ? img.src : '';
}
