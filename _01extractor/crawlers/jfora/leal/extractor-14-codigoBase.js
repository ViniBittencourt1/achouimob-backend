import { JSDOM } from 'jsdom';
// Extrai o código base a partir do HTML do card
// cardHtml: string (HTML do card)
export function extractCodigoBase(cardHtml) {
  if (!cardHtml) return '';
  const doc = JSDOM.fragment(cardHtml);
  const codigo = doc.querySelector('small.reference.property_full_reference.pull-right');
  if (!codigo) return '';
  return codigo.textContent.trim();
}
