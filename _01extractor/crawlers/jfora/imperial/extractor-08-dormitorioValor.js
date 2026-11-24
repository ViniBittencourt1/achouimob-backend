// Extrai o valor de dormitórios de um card HTML
// cardHtml: string (HTML do card). Formato real: <a data-tooltip="Dormitórios"><i class="fa fa-bed"></i> 4</a>
import { JSDOM } from 'jsdom';
export function extractDormitorioValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const icone = dom.window.document.querySelector('i.fa-bed');
  const container = icone?.closest('a, td');
  if (!container) return 0;
  const match = container.textContent.trim().match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}
