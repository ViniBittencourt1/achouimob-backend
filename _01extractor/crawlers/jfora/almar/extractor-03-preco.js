import { aplicarPrecoAPartir } from '../_utils/precoAPartir.js';
import { JSDOM } from 'jsdom';
import { extractPrecoLocacao } from '../_utils/locacaoPadraoPreco.js';

// Extrai o campo preco de um card HTML
// cardHtml: string (HTML do card)
function extractPrecoBase(cardHtml, negociacao) {
  if (negociacao === 'locacao') return extractPrecoLocacao(cardHtml);
  const dom = new JSDOM(cardHtml);
  const precoB = dom.window.document.querySelector('div.imovel-item--preco b');
  const precoStr = precoB ? precoB.textContent.trim() : '';
  // Extrai apenas os números inteiros (sem separador decimal ou string)
  const numeros = precoStr.replace(/[^0-9]/g, '');
  // Divide por 100 para ajustar para milhares
  if (!numeros) return 0;
  return Math.floor(Number(numeros) / 100);
}

export function extractPreco(...args) {
  return aplicarPrecoAPartir(extractPrecoBase(...args), args[0], args[1]);
}
