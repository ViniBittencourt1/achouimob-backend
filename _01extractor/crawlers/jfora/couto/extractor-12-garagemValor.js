// Extrai o valor de garagem de um card HTML
// cardHtml: string (HTML do card)
import { JSDOM } from 'jsdom';
export function extractGaragemValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const garagemLi = dom.window.document.querySelector('li.sc-garagens');
  if (garagemLi) {
    const match = garagemLi.textContent.match(/(\d+)/);
    if (match?.[1]) return Number(match[1]);
  }

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

  const texto = (dom.window.document.body?.textContent || '').replace(/\s+/g, ' ');
  const fallback = texto.match(/(\d+)\s*garagens?/i);
  if (fallback?.[1]) return Number(fallback[1]);

  return 0;
}
