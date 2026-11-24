import { aplicarPrecoAPartir } from '../_utils/precoAPartir.js';
import { JSDOM } from 'jsdom';

// Extrai o campo preco de um card HTML
// cardHtml: string (HTML do card)
function extractPrecoBase(cardHtml, negociacao) {
  const dom = new JSDOM(cardHtml);
  const document = dom.window.document;
  const precoB = negociacao === 'locacao'
    ? Array.from(document.querySelectorAll('.imovel-item--preco--item'))
      .find(item => /loca[çc][aã]o|aluguel/i.test(item.querySelector('small')?.textContent ?? ''))
      ?.querySelector('b')
    : document.querySelector('div.imovel-item--preco b');
  const precoStr = precoB ? precoB.textContent.trim() : '';
  // Extrai apenas os números inteiros (sem separador decimal ou string)
  const numeros = precoStr.replace(/[^0-9]/g, '');
  // Divide por 100 para ajustar para milhares
  return numeros ? Math.floor(Number(numeros) / 100) : null;
}

export function extractPreco(...args) {
  return aplicarPrecoAPartir(extractPrecoBase(...args), args[0], args[1]);
}
