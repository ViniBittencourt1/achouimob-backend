import { JSDOM } from 'jsdom';

// Extrai o valor numérico de banheiros do card HTML
export function extractBanheiroValor(cardHtml) {
  const doc = JSDOM.fragment(cardHtml);
  const valores = doc.querySelectorAll('div.value p');

  for (const valor of valores) {
    const texto = valor.textContent.replace(/\s+/g, '').trim().toLowerCase();
    if (!/(banheiro|banheiros)/.test(texto)) continue;

    const numero = valor.querySelector('span.h-money')?.textContent?.trim() || '';
    if (numero) return parseInt(numero, 10);

    const matchNumero = texto.match(/(\d+)/);
    return matchNumero ? parseInt(matchNumero[1], 10) : 0;
  }

  return 0;
}
