import { JSDOM } from 'jsdom';

// Extrai o campo localizacao de um card HTML
// cardHtml: string (HTML do card)
export function extractLocalizacao(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const h3 = dom.window.document.querySelector('h3.cor2');
  return h3 ? h3.textContent.trim() : '';
}
