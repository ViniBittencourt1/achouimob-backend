import { JSDOM } from 'jsdom';

// Extrai o valor de garagem de um card HTML
// cardHtml: string (HTML do card)
export function extractGaragemValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const small = dom.window.document.querySelector("div.imovel--icon[data-icon='vagas'] small");
  if (!small) return 0;
  const match = small.textContent.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}
