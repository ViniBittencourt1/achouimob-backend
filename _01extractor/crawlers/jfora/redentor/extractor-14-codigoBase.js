import { JSDOM } from 'jsdom';

// Extrai o código base a partir do HTML do card
// cardHtml: string (HTML do card)
export function extractCodigoBase(cardHtml) {
  if (!cardHtml) return '';
  const dom = new JSDOM(cardHtml);
  const span = dom.window.document.querySelector('div.imovel-item--cod span');
  if (!span) return '';
  const match = span.textContent.match(/\d+/);
  return match ? match[0] : '';
}
