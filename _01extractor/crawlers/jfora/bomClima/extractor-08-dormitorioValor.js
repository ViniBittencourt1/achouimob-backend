
import { JSDOM } from 'jsdom';

// Extrai o valor de dormitórios de um card HTML
// cardHtml: string (HTML do card)
export function extractDormitorioValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const ul = dom.window.document.querySelector('ul.Icons_list__SlDEy');
  if (!ul) return 0;
  const lis = Array.from(ul.querySelectorAll('li'));
  for (const li of lis) {
    const text = li.textContent.trim();
    const match = text.match(/(\d+)\s*(?=Quartos?|quartos?)/);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  return 0;
}
