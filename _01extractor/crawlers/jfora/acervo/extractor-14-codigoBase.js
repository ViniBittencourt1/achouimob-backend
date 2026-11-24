
import { JSDOM } from 'jsdom';

// Extrai o valor do <span itemprop="name">...</span> como código base
export function extractCodigoBase(cardHtml, linkReal = '') {
  const codigoFromLink = String(linkReal).match(/\/([^/]+)$/)?.[1] || '';
  if (codigoFromLink) return codigoFromLink;
  if (!cardHtml) return '';
  const dom = new JSDOM(cardHtml);
  const breadcrumb = dom.window.document.querySelectorAll('.breadcrumb li');
  // Busca o codigoBase no último item do breadcrumb
  if (breadcrumb && breadcrumb.length >= 1) {
    const span = breadcrumb[breadcrumb.length - 1].querySelector("span[itemprop='name']");
    if (span) {
      return span.textContent.trim();
    }
  }
  return '';
}
