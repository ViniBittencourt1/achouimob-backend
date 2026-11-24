import { JSDOM } from 'jsdom';

// Extrai o campo localizacao de um card HTML
// cardHtml: string (HTML do card)
export function extractLocalizacao(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const h2 = dom.window.document.querySelector('h2.imovelcard__info__local');
  return h2 ? h2.textContent.trim() : '';
}
