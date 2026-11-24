import { JSDOM } from 'jsdom';

// Extrai o valor de dormitórios de um card HTML
// cardHtml: string (HTML do card)
export function extractDormitorioValor(cardHtml) {
  const doc = JSDOM.fragment(cardHtml);
  const valores = doc.querySelectorAll('div.value p');

  for (const valor of valores) {
    const texto = valor.textContent.replace(/\s+/g, '').trim().toLowerCase();
    if (!/(quarto|quartos|dormitorio|dormitorios|dormitório|dormitórios)/.test(texto)) continue;

    const numero = valor.querySelector('span.h-money')?.textContent?.trim() || '';
    if (numero) return parseInt(numero, 10);

    const matchNumero = texto.match(/(\d+)/);
    return matchNumero ? parseInt(matchNumero[1], 10) : 0;
  }

  return 0;
}
