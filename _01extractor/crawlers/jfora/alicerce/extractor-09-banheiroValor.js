import { JSDOM } from 'jsdom';

// Extrai o valor numérico de banheiros do card HTML
export function extractBanheiroValor(cardHtml) {
  const doc = JSDOM.fragment(cardHtml);
  const div = doc.querySelector("div.imovel--icon[data-icon='banheiros'] small");
  if (!div) return 0;
  const match = div.textContent.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}
