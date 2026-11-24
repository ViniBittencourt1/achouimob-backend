import { JSDOM } from 'jsdom';

// Extrai o valor numérico de banheiros do card HTML
export function extractBanheiroValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const div = dom.window.document.querySelector("div.imovel--icon[data-icon='banheiros'] small");
  if (!div) return 0;
  const match = div.textContent.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}
