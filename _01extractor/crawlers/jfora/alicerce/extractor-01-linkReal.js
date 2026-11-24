import { JSDOM } from 'jsdom';

// Extrai o campo linkReal de um card HTML
// cardHtml: string (HTML do card)
export function extractLinkReal(cardHtml) {
  let doc;
  // Node.js: usar JSDOM
  doc = JSDOM.fragment(cardHtml);
  const a = doc.querySelector('a');
  if (!a) return '';
  // Se já for um link absoluto, retorna direto
  if (a.href.startsWith('http')) return a.href;
  // Monta o link completo
  return `https://alicerceimob.com.br/${a.getAttribute('href')}`;
}
