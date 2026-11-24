import { aplicarPrecoAPartir } from '../_utils/precoAPartir.js';
import { JSDOM } from 'jsdom';

// Extrai o campo preco de um card HTML
// cardHtml: string (HTML do card). Preco fica em <li>R$ 3.500.000,00</li>.
// Cuidado: alguns cards tambem tem um <td> "Valor por m2" (ex: R$380,00 m2)
// que NAO pode ser confundido com o preco total, por isso buscamos so em <li>.
function extractPrecoBase(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const lis = Array.from(dom.window.document.querySelectorAll('li'));
  const precoLi = lis.find((li) => /^R\$\s*[\d.,]+$/.test(li.textContent.trim()));
  const precoStr = precoLi ? precoLi.textContent.trim() : cardHtml;

  const match = precoStr.match(/R\$\s*([\d.]+),\d{2}/);
  if (match && match[1]) {
    return parseInt(match[1].replace(/\./g, ''), 10);
  }
  const fallback = precoStr.match(/R\$\s*([\d.,]+)/);
  const numeros = fallback ? fallback[1].replace(/[^0-9]/g, '') : '';
  return numeros ? parseInt(numeros, 10) : 0;
}

export function extractPreco(...args) {
  return aplicarPrecoAPartir(extractPrecoBase(...args), args[0], args[1]);
}
