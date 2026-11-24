
import { JSDOM } from 'jsdom';

// Extrai o valor numérico de banheiros do card HTML
export function extractBanheiroValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const doc = dom.window.document;
  const txt = (doc.querySelector('.wpgb-block-12')?.textContent || doc.body?.textContent || '').replace(/\s+/g, ' ').trim();
  const match = txt.match(/(\d+)\s*banh/i);
  if (match?.[1]) return parseInt(match[1], 10);
  return 0;
}
