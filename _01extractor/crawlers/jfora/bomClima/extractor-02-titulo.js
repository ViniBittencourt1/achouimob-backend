// Extrai o bairro a partir do título, pegando o texto entre '|' e '-'
export function extractBairroFromTitulo(titulo) {
  if (!titulo) return '';
  // Exemplo: "Cobertura | BOM PASTOR - Juiz de Fora"
  const match = titulo.match(/\|([^\-]+)-/);
  if (match && match[1]) {
    return match[1].trim();
  }
  return '';
}

import { JSDOM } from 'jsdom';

// Extrai o campo título de um card HTML
// cardHtml: string (HTML do card)
export function extractTitulo(cardHtml, options = {}) {
  const dom = new JSDOM(cardHtml);
  // Busca o span do título pelo início da classe (pois pode ter classes dinâmicas)
  const span = Array.from(dom.window.document.querySelectorAll('span')).find(el =>
    el.className.includes('ImovelCardInfo_colorOfTitleCondominium__IfTu_')
  );
  const titulo = span?.textContent.trim() || '';
  if (!options.incluirTaxas) return titulo;
  const taxas = Array.from(dom.window.document.querySelectorAll('[class*="ImovelCardInfo_feesValue__"]'))
    .map(element => element.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' / ');
  return [titulo, taxas].filter(Boolean).join(' | ');
}
