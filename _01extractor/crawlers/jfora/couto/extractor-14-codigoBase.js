// Extrai o código base do HTML do card
// cardHtml: string (HTML do card)
import { JSDOM } from 'jsdom';

export function extractCodigoBase(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const referencia = dom.window.document.querySelector('span.cr b');
  if (referencia?.textContent?.trim()) {
    return referencia.textContent.trim();
  }

  const matchRef = cardHtml.match(/C[oó]d\.?\s*Refer[êe]ncia\s*:\s*<b>\s*([^<\s]+)\s*<\/b>/is);
  if (matchRef?.[1]) {
    return matchRef[1].trim();
  }

  const matchIdUrl = cardHtml.match(/\/detalhes-imovel\/(\d+)-/i);
  return matchIdUrl?.[1] || '';
}
