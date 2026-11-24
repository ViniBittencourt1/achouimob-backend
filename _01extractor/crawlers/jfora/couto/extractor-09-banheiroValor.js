// Extrai apenas o número de banheiros do HTML detalhado da rota interna
import { JSDOM } from 'jsdom';
export function extractBanheiroValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const banheiroLi = dom.window.document.querySelector('li.sc-banheiros');
  if (banheiroLi) {
    const match = banheiroLi.textContent.match(/(\d+)/);
    if (match?.[1]) return Number(match[1]);
  }

  const features = dom.window.document.querySelectorAll('div.imovelcard__info__feature');
  for (const feature of features) {
    const i = feature.querySelector('i');
    if (i && i.className.includes('fa-shower')) {
      const b = feature.querySelector('p > b');
      if (b) {
        const val = b.textContent.trim();
        if (val !== "") return Number(val);
      }
    }
  }

  const texto = (dom.window.document.body?.textContent || '').replace(/\s+/g, ' ');
  const fallback = texto.match(/(\d+)\s*banheiros?/i);
  if (fallback?.[1]) return Number(fallback[1]);

  return 0;
}
