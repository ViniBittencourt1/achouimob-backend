import { aplicarPrecoAPartir } from '../_utils/precoAPartir.js';
import { JSDOM } from 'jsdom';

// Extrai o campo preco de um card HTML
// cardHtml: string (HTML do card)
function extractPrecoBase(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const doc = dom.window.document;
  const candidatos = [
    doc.querySelector('.wpgb-block-10')?.textContent,
    doc.querySelector('.wpgb-block-16')?.textContent,
    doc.querySelector('.wpgb-block-1')?.textContent,
    doc.body?.textContent,
  ];

  for (const candidato of candidatos) {
    const txt = String(candidato || '').replace(/\s+/g, ' ').trim();
    if (!txt) continue;

    const match = txt.match(/(?:R\$\s*)?([\d\.]+)(?:,\d{2})?/);
    if (!match?.[1]) continue;

    const valor = Number(match[1].replace(/\./g, ''));
    if (Number.isFinite(valor) && valor > 0) {
      return valor;
    }
  }

  return 0;
}

export function extractPreco(...args) {
  return aplicarPrecoAPartir(extractPrecoBase(...args), args[0], args[1]);
}
