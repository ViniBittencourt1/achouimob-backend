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
  let valor = null;
  if (/por/i.test(precoStr)) {
    // Se houver 'por', pega o valor imediatamente após
    const match = precoStr.match(/por\s*([\d\.\,]+)/i);
    if (match && match[1]) {
      valor = match[1].replace(/\./g, '').replace(/,/g, '.');
    }
  }
  if (!valor) {
    // Se não houver 'por', pega o primeiro valor encontrado
    const match = precoStr.match(/([\d\.\,]+)/);
    if (match && match[1]) {
      valor = match[1].replace(/\./g, '').replace(/,/g, '.');
    }
  }
  // Ajusta o valor conforme palavras encontradas
  let resultado = valor ? Math.floor(Number(valor)).toString() : '0';
  if (resultado) {
    const textoNorm = precoStr.toLowerCase();
    if (/(milhão|milhões|mm)/.test(textoNorm)) {
      resultado += '000000';
    } else if (/mil/.test(textoNorm)) {
      resultado += '000';
    }
  }
  return resultado ? Number(resultado) : null;
}

export function extractPreco(...args) {
  return aplicarPrecoAPartir(extractPrecoBase(...args), args[0], args[1]);
}
