import { JSDOM } from 'jsdom';

// Extrai o valor numérico de banheiros do card HTML
export function extractBanheiroValor(cardHtml) {
  // Procura diretamente o padrão "N Banheiro(s)" no HTML
  const match = cardHtml.match(/(\d+)\s*Banheiros?/i) || cardHtml.match(/(\d+)\s*Banheiro(?!s)/i);
  if (match) return parseInt(match[1], 10);
  // Fallback para regra antiga
  const dom = new JSDOM(cardHtml);
  const div = dom.window.document.querySelector("div.imovel--icon[data-icon='banheiros'] small");
  if (!div) return 0;
  const matchOld = div.textContent.match(/\d+/);
  return matchOld ? parseInt(matchOld[0], 10) : 0;
}
