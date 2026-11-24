import { JSDOM } from 'jsdom';

// Extrai o valor de área de um card HTML
// cardHtml: string (HTML do card)
export function extractAreaValor(cardHtml) {
  const doc = JSDOM.fragment(cardHtml);
  const valores = doc.querySelectorAll('div.value p');

  for (const valor of valores) {
    const texto = valor.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!texto.includes('m²')) continue;

    const numero = valor.querySelector('span.h-money')?.textContent?.trim() || '';
    return numero ? parseFloat(numero.replace(',', '.')) || 0 : 0;
  }

  return 0;
}
