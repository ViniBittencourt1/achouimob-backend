// Extrai apenas o número de banheiros do HTML detalhado da rota interna
import { JSDOM } from 'jsdom';
export function extractBanheiroValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  // Busca o <li> de banheiros
  const li = dom.window.document.querySelector('li[ng-if*="imovel.banheiros"]');
  if (li) {
    const strong = li.querySelector('strong.ng-binding');
    if (strong) {
      const valor = strong.textContent.trim();
      return valor === '' ? 0 : parseFloat(valor.replace(',', '.')) || 0;
    }
  }
  return 0;
}
