
import { JSDOM } from 'jsdom';

// Extrai o valor de garagem de um card HTML
// cardHtml: string (HTML do card)
export function extractGaragemValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const doc = dom.window.document;
  const txt = (doc.querySelector('.wpgb-block-5')?.textContent || doc.querySelector('.wpgb-block-12')?.textContent || '').replace(/\s+/g, ' ').trim();
  const match = txt.match(/(\d+)\s*vaga/i);
  if (match?.[1]) return parseInt(match[1], 10);
  return 0;
}
