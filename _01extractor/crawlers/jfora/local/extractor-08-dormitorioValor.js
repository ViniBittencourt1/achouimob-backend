import { JSDOM } from 'jsdom';

// Extrai o valor de dormitórios de um card HTML
// cardHtml: string (HTML do card)
export function extractDormitorioValor(cardHtml) {
  // Procura diretamente o padrão "N Quarto(s)" no HTML
  const match = cardHtml.match(/(\d+)\s*Quartos?/i) || cardHtml.match(/(\d+)\s*Quarto(?!s)/i);
  if (match) return parseInt(match[1], 10);
  // Fallback para regra antiga
  const dom = new JSDOM(cardHtml);
  const div = dom.window.document.querySelector("div.imovel--icon[data-icon='quartos'] small");
  if (!div) return 0;
  const matchOld = div.textContent.match(/\d+/);
  return matchOld ? parseInt(matchOld[0], 10) : 0;
}
