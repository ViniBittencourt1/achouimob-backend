// Extrai o valor de garagem de um card HTML
// cardHtml: string (HTML do card)
import { JSDOM } from 'jsdom';
export function extractGaragemValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const features = dom.window.document.querySelectorAll('div.imovelcard__info__feature');
  for (const feature of features) {
    const i = feature.querySelector('i');
    if (i && i.className.includes('fa-car')) {
      const b = feature.querySelector('p > b');
      if (b) {
        const val = b.textContent.trim();
        if (val !== "") return Number(val);
      }
    }
  }
  return 0;
}
