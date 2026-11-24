import { aplicarPrecoAPartir } from '../_utils/precoAPartir.js';
import { JSDOM } from 'jsdom';

// Extrai o campo preco de um card HTML
// cardHtml: string (HTML do card)
function extractPrecoBase(cardHtml, negociacao) {
  const dom = new JSDOM(cardHtml);
  if (negociacao === 'locacao') {
    const row = Array.from(dom.window.document.querySelectorAll('[class*="ImovelCardInfo_priceRow__"]'))
      .find(element => /aluguel|loca[\u00e7c][a\u00e3]o/i.test(element.textContent));
    const value = row?.querySelector('[class*="ImovelCardInfo_priceValue__"]')?.textContent;
    const match = value?.match(/([\d.]+),(\d{2})/);
    if (match) return Number(`${match[1].replace(/\./g, '')}.${match[2]}`);
  }
  // Busca todos os containers de preço
  const priceDivs = dom.window.document.querySelectorAll('div.d-flex.flex-row.justify-content-between.text-truncate');
  for (const div of priceDivs) {
    const spans = div.querySelectorAll('span');
    const label = negociacao === 'locacao' ? /aluguel|loca[\u00e7c][a\u00e3]o/i : /venda/i;
    if (spans.length >= 2 && label.test(spans[0].textContent)) {
      const precoStr = spans[1].textContent.trim();
      const numeros = precoStr.replace(/[^0-9]/g, '');
      if (numeros && numeros.length > 2) {
        // Remove as duas últimas casas decimais
        return Number(numeros.slice(0, -2));
      }
      return numeros ? Number(numeros) : null;
    }
  }
  return null;
}

export function extractPreco(...args) {
  return aplicarPrecoAPartir(extractPrecoBase(...args), args[0], args[1]);
}
