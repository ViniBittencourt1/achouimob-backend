import { JSDOM } from '../_utils/cachedJSDOM.js';

// Extrai o campo localizacao de um card HTML
// cardHtml: string (HTML do card)
export function extractLocalizacao(cardHtml) {
  const dom = new JSDOM(cardHtml);

  const fullAddress = dom.window.document.querySelector('span[class*="fullAddress"]');
  if (fullAddress?.textContent?.trim()) {
    return fullAddress.textContent.replace(/\s+/g, ' ').trim();
  }

  const loc = dom.window.document.querySelector('.search-feat-card__location');
  return loc ? loc.textContent.replace(/\s+/g, ' ').trim() : '';
}
