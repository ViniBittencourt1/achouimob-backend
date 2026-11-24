
import { JSDOM } from 'jsdom';

// Extrai o valor de área de um card HTML
// cardHtml: string (HTML do card)
export function extractAreaValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const doc = dom.window.document;
  const txt = (doc.querySelector('.wpgb-block-17')?.textContent || doc.querySelector('.wpgb-block-12')?.textContent || '').replace(/\s+/g, ' ').trim();
  const match = txt.match(/(\d+[\.,]?\d*)\s*m\s*²?|m²/i) || txt.match(/(\d+[\.,]?\d*)/);
  if (match?.[1]) return parseFloat(match[1].replace('.', '').replace(',', '.')) || 0;
  return 0;
}
