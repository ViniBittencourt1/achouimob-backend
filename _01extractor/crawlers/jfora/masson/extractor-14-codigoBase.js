import { JSDOM } from '../_utils/cachedJSDOM.js';
// Extrai o código base a partir do HTML do card
// cardHtml: string (HTML do card)
export function extractCodigoBase(cardHtml) {
  if (!cardHtml) return '';
  const dom = new JSDOM(cardHtml);
  const p = dom.window.document.querySelector('p.card-with-buttons__code');
  if (!p) return '';
  return p.textContent.trim();
}
