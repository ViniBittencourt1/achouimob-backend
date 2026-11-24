
import { JSDOM } from 'jsdom';

// Extrai o valor de dormitórios de um card HTML
// cardHtml: string (HTML do card)
export function extractDormitorioValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const doc = dom.window.document;
  const txt = (doc.querySelector('.wpgb-block-8')?.textContent || doc.querySelector('.wpgb-block-12')?.textContent || '').replace(/\s+/g, ' ').trim();
  const match = txt.match(/(\d+)\s*dorm/i);
  if (match?.[1]) return parseInt(match[1], 10);
  return 0;
}
