import { JSDOM } from 'jsdom';

// Extrai o valor de Ã¡rea de um card HTML
// cardHtml: string (HTML do card)
export function extractAreaValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const valores = dom.window.document.querySelectorAll('div.value p');

  for (const valor of valores) {
    const texto = valor.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!/m(?:²|2)/.test(texto)) continue;

    const numero = valor.querySelector('span.h-money')?.textContent?.trim() || '';
    return numero ? parseFloat(numero.replace(',', '.')) || 0 : 0;
  }

  return 0;
}
