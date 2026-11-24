import { JSDOM } from 'jsdom';

// Extrai o campo localizacao de um card HTML
// cardHtml: string (HTML do card)
export function extractLocalizacao(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const f = dom.window.document.querySelector('f.ng-binding.ng-scope');
  return f ? f.textContent.trim() : '';
}
