
import { JSDOM } from 'jsdom';

// Extrai o valor numérico de banheiros do card HTML
export function extractBanheiroValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const icon = dom.window.document.querySelector('i[data-testid="fa-shower"], i.fa-shower');
  const value = icon?.closest('li')?.querySelector('span[class*="Icons_value"]')?.textContent || '';
  const match = value.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}
