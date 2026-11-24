import { JSDOM } from 'jsdom';

// Extrai o valor de Ã¡rea de um card HTML
// cardHtml: string (HTML do card)
export function extractAreaValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const valores = dom.window.document.querySelectorAll('ul li');

  for (const valor of valores) {
    const texto = valor.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!/mÂ²|m2/.test(texto)) continue;

    const matchNumero = texto.match(/(\d+[\.,]?\d*)/);
    return matchNumero ? parseFloat(matchNumero[1].replace(',', '.')) || 0 : 0;
  }

  return 0;
}
