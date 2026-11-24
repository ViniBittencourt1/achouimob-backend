import { aplicarPrecoAPartir } from '../_utils/precoAPartir.js';
import { JSDOM } from 'jsdom';
// Extrai o campo preco de um card HTML
// cardHtml: string (HTML do card)
function extractPrecoBase(cardHtml) {
  const doc = JSDOM.fragment(cardHtml);
  const preco = doc.querySelector('span.h-money.location');
  if (!preco) return null;

  const precoStr = preco.textContent.trim();
  const numeros = precoStr.replace(/[^0-9]/g, '');
  return numeros ? Number(numeros) : null;
}

export function extractPreco(...args) {
  return aplicarPrecoAPartir(extractPrecoBase(...args), args[0], args[1]);
}
