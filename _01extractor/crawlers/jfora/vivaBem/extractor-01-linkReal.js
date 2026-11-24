import { JSDOM } from 'jsdom';

// Extrai o campo linkReal de um card HTML
// cardHtml: string (HTML do card)
export function extractLinkReal(cardHtml) {
  let doc;
  // Node.js: usar JSDOM
  const dom = new JSDOM(cardHtml);
  doc = dom.window.document;
  const a = doc.querySelector('a');
  if (!a) return '';
  // Se jÃ¡ for um link absoluto, retorna direto
  if (a.href.startsWith('http')) return a.href;
  // Monta o link completo com o domÃ­nio correto
  return `https://www.vivabemimoveisjf.com.br${a.getAttribute('href')}`;
}
