import { JSDOM } from 'jsdom';

// Extrai o valor de garagem de um card HTML
// cardHtml: string (HTML do card)
export function extractGaragemValor(cardHtml) {
  const doc = JSDOM.fragment(cardHtml);
  const small = doc.querySelector("div.imovel--icon[data-icon='vagas'] small");
  if (!small) return 0;
  const match = small.textContent.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}
