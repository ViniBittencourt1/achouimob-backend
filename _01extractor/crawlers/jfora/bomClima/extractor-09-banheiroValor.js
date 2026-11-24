
import { JSDOM } from 'jsdom';

// Extrai o valor numérico de banheiros do card HTML
export function extractBanheiroValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const ul = dom.window.document.querySelector('ul.Icons_list__SlDEy');
  if (!ul) return 0;
  const lis = Array.from(ul.querySelectorAll('li'));
  for (const li of lis) {
    const text = li.textContent.trim();
    const match = text.match(/(\d+)\s*(?=Banheiros?|banheiros?)/);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  return 0;
}
