import { JSDOM } from 'jsdom';

// Extrai o campo localizacao de um card HTML
// cardHtml: string (HTML do card)
export function extractLocalizacao(cardHtml) {
  const doc = JSDOM.fragment(cardHtml);
  const divLoc = doc.querySelector('div.imovel-item--localizacao');
  return divLoc ? divLoc.textContent.trim() : '';
}
