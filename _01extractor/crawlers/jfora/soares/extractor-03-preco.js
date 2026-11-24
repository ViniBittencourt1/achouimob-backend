import { aplicarPrecoAPartir } from '../_utils/precoAPartir.js';

// Extrai o campo preco de um card HTML
// cardHtml: string (HTML do card)
import { JSDOM } from 'jsdom';

function extractPrecoBase(cardHtml, negociacao) {
  if (negociacao === 'locacao') {
    const document = new JSDOM(cardHtml).window.document;
    const row = Array.from(document.querySelectorAll('li')).find(item => /^aluguel$/i.test(item.querySelector('.descricao-transacao')?.textContent.trim() || ''));
    if (!row) throw new Error('Bloco Aluguel nao encontrado no card Soares.');
    const value = row.querySelector('strong.valor-transacao')?.textContent || '';
    const match = value.match(/R\$\s*([\d.]+)(?:,(\d{1,2}))?/);
    return match ? Number(`${match[1].replace(/\./g, '')}.${match[2] ?? '0'}`) : null;
  }
  let precoStr = '';
  if (typeof window === 'undefined') {
    // Node.js: usar JSDOM
    const dom = new JSDOM(cardHtml);
    const precoStrong = dom.window.document.querySelector('strong.valor-transacao');
    precoStr = precoStrong ? precoStrong.textContent.trim() : '';
  } else {
    // Browser: usar DOMParser
    const parser = new DOMParser();
    const doc = parser.parseFromString(cardHtml, 'text/html');
    const precoStrong = doc.querySelector('strong.valor-transacao');
    precoStr = precoStrong ? precoStrong.textContent.trim() : '';
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
