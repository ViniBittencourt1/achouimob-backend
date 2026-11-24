
import { JSDOM } from 'jsdom';

// Extrai o valor de garagem de um card HTML
// cardHtml: string (HTML do card)
export function extractGaragemValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const icon = dom.window.document.querySelector('i[data-testid="fa-car"], i.fa-car');
  const value = icon?.closest('li')?.querySelector('span[class*="Icons_value"]')?.textContent || '';
  const match = value.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}
