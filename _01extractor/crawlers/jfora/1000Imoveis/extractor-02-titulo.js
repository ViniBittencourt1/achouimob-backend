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
export function extractTitulo(cardHtml) {
  // Node.js: usar JSDOM
  const dom = new JSDOM(cardHtml);
  const tituloDiv = dom.window.document.querySelector('div.imovel-item--titulo');
  if (!tituloDiv) return '';
  return tituloDiv.textContent.trim();
}
