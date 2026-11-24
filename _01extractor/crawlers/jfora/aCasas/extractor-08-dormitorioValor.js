// Extrai o valor de dormitórios de um card HTML
// cardHtml: string (HTML do card)
import { JSDOM } from 'jsdom';
export function extractDormitorioValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const dormitorioLi = dom.window.document.querySelector('li.sc-dormitorios');
  if (dormitorioLi) {
    const match = dormitorioLi.textContent.match(/(\d+)/);
    if (match?.[1]) return Number(match[1]);
  }

  const features = dom.window.document.querySelectorAll('div.imovelcard__info__feature');
  for (const feature of features) {
    const i = feature.querySelector('i');
    if (i && i.className.includes('fa-bed')) {
      const b = feature.querySelector('p > b');
      if (b) {
        const val = b.textContent.trim();
        if (val !== "") return Number(val);
      }
    }
  }

  const texto = (dom.window.document.body?.textContent || '').replace(/\s+/g, ' ');
  const flaticonMatch = texto.match(/(\d+)\s*Quartos?/i);
  if (flaticonMatch?.[1]) return Number(flaticonMatch[1]);

  const fallback = texto.match(/(\d+)\s*dormit[oó]rios?/i);
  if (fallback?.[1]) return Number(fallback[1]);

  return 0;
}
