
import { JSDOM } from 'jsdom';

// Extrai o valor de dormitórios de um card HTML
// cardHtml: string (HTML do card)
export function extractDormitorioValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const icon = dom.window.document.querySelector('i[data-testid="fa-bed"], i.fa-bed');
  const value = icon?.closest('li')?.querySelector('span[class*="Icons_value"]')?.textContent || '';
  const match = value.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}
