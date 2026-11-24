import { JSDOM } from '../_utils/cachedJSDOM.js';

// Extrai o valor de área de um card HTML
// cardHtml: string (HTML do card)
export function extractAreaValor(cardHtml) {
  // Procura diretamente o padrão "N m²" no HTML
  const match = cardHtml.match(/([\d,.]+)\s*m²/i);
  if (match) return parseFloat(match[1].replace(',', '.')) || 0;
  // Fallback para regra antiga
  const dom = new JSDOM(cardHtml);
  const small = dom.window.document.querySelector("div.imovel--icon[data-icon='area_iptu'] small");
  if (!small) return 0;
  const matchOld = small.textContent.match(/(\d+[\.,]?\d*)\s*m²/i);
  return matchOld ? parseFloat(matchOld[1].replace(',', '.')) || 0 : 0;
}
