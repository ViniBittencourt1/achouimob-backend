import { aplicarPrecoAPartir } from '../_utils/precoAPartir.js';
import { JSDOM } from 'jsdom';
// Extrai o campo preco de um card HTML
// cardHtml: string (HTML do card)
function extractPrecoBase(cardHtml, negociacao) {
  const dom = new JSDOM(cardHtml);
  // Busca todos os containers de valor
  const valueContainers = dom.window.document.querySelectorAll('div.card-with-buttons__value-container');
  for (const container of valueContainers) {
    const title = container.querySelector('p.card-with-buttons__value-title');
    const value = container.querySelector('p.card-with-buttons__value');
    const label = negociacao === 'locacao' ? /aluguel|loca[\u00e7c][a\u00e3]o/i : /venda/i;
    if (title && value && label.test(title.textContent)) {
      const precoStr = value.textContent.trim();
      if (negociacao === 'locacao') {
        const match = precoStr.match(/R\$\s*([\d.]+)(?:,(\d{1,2}))?/);
        return match ? Number(`${match[1].replace(/\./g, '')}.${match[2] ?? '0'}`) : null;
      }
      const numeros = precoStr.replace(/[^0-9]/g, '');
      return numeros ? Number(numeros) : 0;
    }
  }
  return negociacao === 'locacao' ? null : 0;
}

export function extractPreco(...args) {
  return aplicarPrecoAPartir(extractPrecoBase(...args), args[0], args[1]);
}
