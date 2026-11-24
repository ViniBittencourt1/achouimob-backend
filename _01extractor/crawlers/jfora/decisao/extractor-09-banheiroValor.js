// Extrai apenas o número de banheiros do HTML detalhado da rota interna
import { JSDOM } from 'jsdom';
export function extractBanheiroValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const features = dom.window.document.querySelectorAll('div.imovelcard__info__feature');
  for (const feature of features) {
    const i = feature.querySelector('i');
    if (i && i.className.includes('fa-shower')) {
      const b = feature.querySelector('p > b');
      if (b) {
        const valor = b.textContent.trim();
        // Extrai apenas números e retorna como float
        const num = parseFloat(valor.replace(/[^0-9.,]/g, '').replace(',', '.'));
        return isNaN(num) ? 0 : num;
      }
    }
  }
  return 0;
}
