// Extrai o valor de banheiros de um card HTML. Formato real:
// <a data-tooltip="Banheiros"><i class="fa fa-shower"></i> 6</a>
import { JSDOM } from 'jsdom';
export function extractBanheiroValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const icone = dom.window.document.querySelector('i.fa-shower');
  const container = icone?.closest('a, td');
  if (!container) return 0;
  const match = container.textContent.trim().match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}
