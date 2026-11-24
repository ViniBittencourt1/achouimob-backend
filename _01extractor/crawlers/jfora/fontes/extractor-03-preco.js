import { aplicarPrecoAPartir } from '../_utils/precoAPartir.js';

// Extrai o campo preco de um card HTML
// cardHtml: string (HTML do card)
import { JSDOM } from 'jsdom';

function extractPrecoBase(cardHtml) {
  let precoStr = '';
  if (typeof window === 'undefined') {
    // Node.js: usar JSDOM
    const dom = new JSDOM(cardHtml);
    const precoP = dom.window.document.querySelector('p.imovelcard__valor__valor');
    precoStr = precoP ? precoP.textContent.trim() : '';
  } else {
    // Browser: usar DOMParser
    const parser = new DOMParser();
    const doc = parser.parseFromString(cardHtml, 'text/html');
    const precoP = doc.querySelector('p.imovelcard__valor__valor');
    precoStr = precoP ? precoP.textContent.trim() : '';
  }
  // Extrai apenas a parte inteira antes da vírgula
  // Exemplo: "R$ 6.500.000,00" => "6500000"
  const match = precoStr.match(/([\d\.]+),\d{2}/);
  if (match && match[1]) {
    // Remove pontos e retorna inteiro
    return parseInt(match[1].replace(/\./g, ''), 10);
  }
  // Fallback: extrai todos os números (sem dividir por 100)
  const numeros = precoStr.replace(/[^0-9]/g, '');
  return numeros ? parseInt(numeros, 10) : 0;
}

export function extractPreco(...args) {
  return aplicarPrecoAPartir(extractPrecoBase(...args), args[0], args[1]);
}
