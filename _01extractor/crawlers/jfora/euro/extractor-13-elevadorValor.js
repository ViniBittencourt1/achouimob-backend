import { JSDOM } from 'jsdom';

// Extrai o valor numérico de elevadores do card HTML
export function extractElevadorValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const small = dom.window.document.querySelector("div.imovel--icon[data-icon='elevadores'] small");
  if (!small) return 0;
  const match = small.textContent.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}
