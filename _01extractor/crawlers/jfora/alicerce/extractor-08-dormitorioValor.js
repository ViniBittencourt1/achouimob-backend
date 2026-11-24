import { JSDOM } from 'jsdom';

// Extrai o valor de dormitórios de um card HTML
// cardHtml: string (HTML do card)
export function extractDormitorioValor(cardHtml) {
  const doc = JSDOM.fragment(cardHtml);
  const div = doc.querySelector("div.imovel--icon[data-icon='quartos'] small");
  if (!div) return 0;
  const match = div.textContent.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}
