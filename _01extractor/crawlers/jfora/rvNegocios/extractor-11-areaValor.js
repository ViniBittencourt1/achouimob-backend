// Extrai o valor de área de um card HTML
// cardHtml: string (HTML do card)
import { JSDOM } from 'jsdom';
export function extractAreaValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const ps = dom.window.document.querySelectorAll('div#desc_tags p');
  for (const p of ps) {
    if (p.textContent.trim().startsWith('Área Total:')) {
      const b = p.querySelector('b');
      if (b) {
        // Extrai número com vírgula ou ponto
        const match = b.textContent.match(/\d+[\.,]?\d*/);
        if (match) {
          let valor = match[0].replace(',', '.');
          // Remove .00 se for inteiro
          if (/\.00$/.test(valor)) {
            valor = valor.replace(/\.00$/, '');
          }
          return parseFloat(valor) || 0;
        } else {
          return 0;
        }
      }
    }
  }
  return 0;
}
