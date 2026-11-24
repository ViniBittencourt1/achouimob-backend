import { aplicarPrecoAPartir } from '../_utils/precoAPartir.js';

// Extrai o campo preco de um card HTML
// cardHtml: string (HTML do card)
import { JSDOM } from 'jsdom';

function extractPrecoBase(cardHtml, negociacao) {
  if (negociacao === 'locacao') {
    const document = new JSDOM(cardHtml).window.document;
    const containers = Array.from(document.querySelectorAll('[class*="CardApartamentHorizontal_price_container"]'));
    let rental = containers.find(item => /aluguel|loca[\u00e7c][a\u00e3]o/i.test(item.querySelector('[class*="CardApartamentHorizontal_price_label"]')?.textContent || ''));
    if (!rental && /aluguel|loca[\u00e7c][a\u00e3]o/i.test(document.body.textContent)) {
      rental = containers.find(item => item.querySelector('[class*="CardApartamentHorizontal_price_value"]')) || null;
    }
    if (!rental) throw new Error('Bloco de aluguel TOC2 nao encontrado.');
    const value = rental.querySelector('[class*="CardApartamentHorizontal_price_value"]')?.textContent || rental.textContent || '';
    const match = value.match(/R\$\s*([\d.]+)(?:,(\d{1,2}))?/);
    return match ? Number(`${match[1].replace(/\./g, '')}.${match[2] ?? '0'}`) : null;
  }
  if (typeof window === 'undefined') {
    // Node.js: usar JSDOM
    const dom = new JSDOM(cardHtml);
    const containers = dom.window.document.querySelectorAll('div.CardApartamentHorizontal_price_container__T0g40');
    for (const container of containers) {
      const label = container.querySelector('p.CardApartamentHorizontal_price_label__EzIcf');
      const value = container.querySelector('p.CardApartamentHorizontal_price_value__ety2r');
      if (label && /venda/i.test(label.textContent) && value) {
        const precoStr = value.textContent.trim();
        const match = precoStr.match(/([\d\.]+),\d{2}/);
        if (match && match[1]) {
          return parseInt(match[1].replace(/\./g, ''), 10);
        }
        const numeros = precoStr.replace(/[^0-9]/g, '');
        return numeros ? parseInt(numeros, 10) : 0;
      }
    }
    return 0;
  } else {
    // Browser: usar DOMParser
    const parser = new DOMParser();
    const doc = parser.parseFromString(cardHtml, 'text/html');
    const containers = doc.querySelectorAll('div.CardApartamentHorizontal_price_container__T0g40');
    for (const container of containers) {
      const label = container.querySelector('p.CardApartamentHorizontal_price_label__EzIcf');
      const value = container.querySelector('p.CardApartamentHorizontal_price_value__ety2r');
      if (label && /venda/i.test(label.textContent) && value) {
        const precoStr = value.textContent.trim();
        const match = precoStr.match(/([\d\.]+),\d{2}/);
        if (match && match[1]) {
          return parseInt(match[1].replace(/\./g, ''), 10);
        }
        const numeros = precoStr.replace(/[^0-9]/g, '');
        return numeros ? parseInt(numeros, 10) : 0;
      }
    }
    return 0;
  }
}

export function extractPreco(...args) {
  return aplicarPrecoAPartir(extractPrecoBase(...args), args[0], args[1]);
}
