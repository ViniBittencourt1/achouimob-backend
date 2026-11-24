// Extrai o código base do HTML do card
// cardHtml: string (HTML do card)
import { JSDOM } from 'jsdom';

export function extractCodigoBase(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const referencia = dom.window.document.querySelector('.search-feat-card__ref');
  if (referencia?.textContent?.trim()) {
    const clean = referencia.textContent.replace(/\s+/g, ' ').trim();
    const match = clean.match(/REF:\s*([^\s]+)/i);
    return match?.[1] || clean;
  }

  const matchRef = cardHtml.match(/REF:\s*([^<\s]+)/i);
  if (matchRef?.[1]) {
    return matchRef[1].trim();
  }

  const matchIdUrl = cardHtml.match(/\/detalhes\/(\d+)\.html/i);
  return matchIdUrl?.[1] || '';
}
