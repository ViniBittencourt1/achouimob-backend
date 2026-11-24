import { JSDOM } from 'jsdom';

// Extrai o campo localizacao de um card HTML
// cardHtml: string (HTML do card)
export function extractLocalizacao(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const loc = dom.window.document.querySelector('.search-feat-card__location');
  return loc ? loc.textContent.replace(/\s+/g, ' ').trim() : '';
}
