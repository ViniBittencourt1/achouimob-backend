// Extrai o valor de garagem de um card HTML
// cardHtml: string (HTML do card)
import { JSDOM } from 'jsdom';
export function extractGaragemValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  // Busca o <li> de garagem
  const li = dom.window.document.querySelector('li[ng-if*="imovel.garagem"]');
  if (li) {
    const strong = li.querySelector('strong.ng-binding');
    if (strong) {
      const valor = strong.textContent.trim();
      return valor === '' ? 0 : parseFloat(valor.replace(',', '.')) || 0;
    }
  }
  return 0;
}
