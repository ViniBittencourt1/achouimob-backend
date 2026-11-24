import { aplicarPrecoAPartir } from '../_utils/precoAPartir.js';
import { JSDOM } from '../_utils/cachedJSDOM.js';

// Extrai o campo preco de um card HTML
// cardHtml: string (HTML do card)
function extractPrecoBase(cardHtml) {
  const dom = new JSDOM(cardHtml);
  // Busca todos os containers de valor
  const valueContainers = dom.window.document.querySelectorAll('div.card_split_vertically__value-container');
  for (const container of valueContainers) {
    const title = container.querySelector('p.card_split_vertically__value-title');
    const value = container.querySelector('p.card_split_vertically__value');
    if (title && value && /venda/i.test(title.textContent)) {
      const precoStr = value.textContent.trim();
      const numeros = precoStr.replace(/[^0-9]/g, '');
      return numeros ? Number(numeros) : null;
    }
  }
  return null;
}

export function extractPreco(...args) {
  return aplicarPrecoAPartir(extractPrecoBase(...args), args[0], args[1]);
}
