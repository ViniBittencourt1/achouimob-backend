import { JSDOM } from 'jsdom';
// Extrai o cÃ³digo base a partir do HTML do card
// cardHtml: string (HTML do card)
export function extractCodigoBase(cardHtml) {
  if (!cardHtml) return '';
  const dom = new JSDOM(cardHtml);
  const codigo = dom.window.document.querySelector('small.reference.property_full_reference.pull-right');
  if (!codigo) return '';
  return codigo.textContent.trim();
}
