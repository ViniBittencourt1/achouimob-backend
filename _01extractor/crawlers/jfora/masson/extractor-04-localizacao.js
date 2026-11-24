import { JSDOM } from '../_utils/cachedJSDOM.js';
// Extrai o campo localizacao de um card HTML
// cardHtml: string (HTML do card)
export function extractLocalizacao(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const h2Loc = dom.window.document.querySelector('h2.card-with-buttons__heading');
  return h2Loc ? h2Loc.textContent.trim() : '';
}
