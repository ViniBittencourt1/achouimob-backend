import { JSDOM } from 'jsdom';

// Extrai o valor de área de um card HTML
// cardHtml: string (HTML do card)
export function extractAreaValor(cardHtml) {
  const doc = JSDOM.fragment(cardHtml);
  const small = doc.querySelector("div.imovel--icon[data-icon='area_iptu'] small");
  if (!small) return 0;
  // Extrai número antes de m²
  const match = small.textContent.match(/(\d+[\.,]?\d*)\s*m²/i);
  if (!match) return 0;
  const valor = parseFloat(match[1].replace(',', '.'));
  return isNaN(valor) ? 0 : valor;
}
