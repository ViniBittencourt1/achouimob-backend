
import { JSDOM } from 'jsdom';

// Extrai o valor de área de um card HTML
// cardHtml: string (HTML do card)
export function extractAreaValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const icon = dom.window.document.querySelector('i[data-testid="fa-ruler-horizontal"], i.fa-ruler-horizontal, i.fa-ruler-triangle');
  const value = icon?.closest('li')?.querySelector('span[class*="Icons_value"]')?.textContent || '';
  const match = value.match(/\d+[\.,]?\d*/);
  return match ? match[0].replace(',', '.') : 0;
}
