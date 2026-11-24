import { aplicarPrecoAPartir } from '../_utils/precoAPartir.js';
import { JSDOM } from 'jsdom';
import { extractPrecoLocacao } from '../_utils/locacaoPadraoPreco.js';

// Extrai o campo preco de um card HTML
// cardHtml: string (HTML do card)
function extractPrecoBase(cardHtml, negociacao) {
  if (negociacao === 'locacao') return extractPrecoLocacao(cardHtml);
  const dom = new JSDOM(cardHtml);
  const precoB = dom.window.document.querySelector('div.imovel-item--preco b');
  let precoStr = precoB ? precoB.textContent.trim() : '';
  let encontrouPor = false;
  if (precoStr.toLowerCase().includes('por')) {
    encontrouPor = true;
    // Extrai tudo após "por"
    const partes = precoStr.split(/por/i);
    if (partes[1]) {
      // Captura o primeiro número após "por" ignorando pontos
      const match = partes[1].match(/\s*R?\$?\s*([0-9]{1,3}(?:\.[0-9]{3})*|[0-9]+)/);
      if (match && match[1]) {
        // Remove pontos separadores de milhar
        precoStr = match[1].replace(/\./g, '');
      } else {
        precoStr = partes[1].trim();
      }
    }
  }
  // Extrai apenas os números inteiros (sem separador decimal ou string)
  const numeros = precoStr.replace(/[^0-9]/g, '');
  if (encontrouPor) {
    return numeros ? Number(numeros) : 0;
  } else {
    // Corta casas decimais após a vírgula
    if (numeros.length > 2) {
      return Number(numeros.slice(0, -2));
    }
    return numeros ? Number(numeros) : 0;
  }
}

export function extractPreco(...args) {
  return aplicarPrecoAPartir(extractPrecoBase(...args), args[0], args[1]);
}
