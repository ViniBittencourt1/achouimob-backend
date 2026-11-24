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
  const dom = new JSDOM(cardHtml);
  const doc = dom.window.document;
  const titulo = doc.querySelector('.wpgb-block-11, h3 a, h2 a, h4 a')?.textContent?.trim() || '';
  if (titulo) return titulo;

  const codigo = doc.querySelector('.wpgb-block-4, .wpgb-block-6')?.textContent?.trim() || '';
  return codigo;
}
