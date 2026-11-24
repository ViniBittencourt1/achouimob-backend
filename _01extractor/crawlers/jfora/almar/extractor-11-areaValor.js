import { JSDOM } from 'jsdom';

// Extrai o valor de área de um card HTML
// cardHtml: string (HTML do card)
export function extractAreaValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const small = dom.window.document.querySelector("div.imovel--icon[data-icon='area_iptu'] small");
  if (!small) return 0;
  // Extrai número antes de m²
  const match = small.textContent.match(/(\d+[\.,]?\d*)\s*m²/i);
  if (!match) return 0;
  const num = parseFloat(match[1].replace(',', '.'));
  return isNaN(num) ? 0 : num;
}
