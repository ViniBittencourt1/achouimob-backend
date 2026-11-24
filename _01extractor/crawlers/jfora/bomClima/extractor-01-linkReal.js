import { JSDOM } from 'jsdom';

// Extrai o campo linkReal de um card HTML
// cardHtml: string (HTML do card)
export function extractLinkReal(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const doc = dom.window.document;
  const a = doc.querySelector('a');
  if (!a) return '';
  const href = a.getAttribute('href') || '';
  if (href.startsWith('http')) return href;
  // Garante que não haja barra dupla
  return `https://www.bomclimaimoveisjf.com.br${href.startsWith('/') ? '' : '/'}${href}`;
}
