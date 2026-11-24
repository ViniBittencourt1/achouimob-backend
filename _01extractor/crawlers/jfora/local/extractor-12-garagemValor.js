import { JSDOM } from 'jsdom';

// Extrai o valor de garagem de um card HTML
// cardHtml: string (HTML do card)
export function extractGaragemValor(cardHtml) {
  // Procura diretamente o padrão "N Vaga(s)" no HTML
  const match = cardHtml.match(/(\d+)\s*Vagas?/i) || cardHtml.match(/(\d+)\s*Vaga(?!s)/i);
  if (match) return parseInt(match[1], 10);
  // Fallback para regra antiga
  const dom = new JSDOM(cardHtml);
  const small = dom.window.document.querySelector("div.imovel--icon[data-icon='vagas'] small");
  if (!small) return 0;
  const matchOld = small.textContent.match(/\d+/);
  return matchOld ? parseInt(matchOld[0], 10) : 0;
}
