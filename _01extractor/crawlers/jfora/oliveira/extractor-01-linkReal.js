import { JSDOM } from 'jsdom';

// Extrai o campo linkReal de um card HTML
// cardHtml: string (HTML do card)
export function extractLinkReal(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const doc = dom.window.document;
  // Busca o primeiro <a href="...">
  let href = '';
  const a = doc.querySelector('a[href]');
  if (a) {
    href = a.getAttribute('href');
  }
  if (href) {
    // Monta a URL absoluta se necessário
    if (href.startsWith('/')) {
      return 'https://oliveiramendesimoveisjf.com.br' + href;
    }
    return href;
  }
  return '';
}
