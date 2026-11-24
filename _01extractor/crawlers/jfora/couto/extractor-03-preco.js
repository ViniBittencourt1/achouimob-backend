import { aplicarPrecoAPartir } from '../_utils/precoAPartir.js';

// Extrai o campo preco de um card HTML
// cardHtml: string (HTML do card)
import { JSDOM } from 'jsdom';

function extractPrecoBase(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const doc = dom.window.document;

  const candidatos = [
    doc.querySelector('.box-info-menu .valores .valor .vn')?.textContent,
    doc.querySelector('.valores .valor .vn')?.textContent,
    doc.querySelector('span.valorImovel')?.textContent,
    doc.querySelector('p.imovelcard__valor__valor')?.textContent,
  ].filter(Boolean);

  let precoStr = candidatos[0] || '';

  if (!precoStr) {
    const texto = (doc.body?.textContent || '').replace(/\s+/g, ' ');
    const matchVenda = texto.match(/valor\s+de\s+venda\s*:?\s*(R\$\s*[\d\.]+,\d{2})/i);
    if (matchVenda?.[1]) {
      precoStr = matchVenda[1];
    } else {
      const matchPreco = texto.match(/(R\$\s*[\d\.]+,\d{2})/i);
      precoStr = matchPreco?.[1] || '';
    }
  }

  const match = precoStr.match(/([\d\.]+),\d{2}/);
  if (match?.[1]) return parseInt(match[1].replace(/\./g, ''), 10);

  const numeros = precoStr.replace(/[^0-9]/g, '');
  return numeros ? parseInt(numeros, 10) : 0;
}

export function extractPreco(...args) {
  return aplicarPrecoAPartir(extractPrecoBase(...args), args[0], args[1]);
}
