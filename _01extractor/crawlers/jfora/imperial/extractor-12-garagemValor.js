// Extrai o valor de garagem de um card HTML. Formato real:
// <a data-tooltip="Vagas"><i class="fa fa-car"></i> 6</a>
import { JSDOM } from 'jsdom';
export function extractGaragemValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const icone = dom.window.document.querySelector('i.fa-car');
  const container = icone?.closest('a, td');
  if (!container) return 0;
  const match = container.textContent.trim().match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}
