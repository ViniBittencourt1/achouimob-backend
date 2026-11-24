import { JSDOM } from 'jsdom';

// Extrai o valor de dormitÃ³rios de um card HTML
// cardHtml: string (HTML do card)
export function extractDormitorioValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const valores = dom.window.document.querySelectorAll('ul li');

  for (const valor of valores) {
    const texto = valor.textContent.replace(/\s+/g, '').trim().toLowerCase();
    if (!/(quarto|quartos|dormitorio|dormitorios|dormitÃ³rio|dormitÃ³rios)/.test(texto)) continue;

    const matchNumero = texto.match(/(\d+)/);
    return matchNumero ? parseInt(matchNumero[1], 10) : 0;
  }

  return 0;
}
