import { JSDOM } from 'jsdom';

// Extrai o valor de garagem de um card HTML
// cardHtml: string (HTML do card)
export function extractGaragemValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const valores = dom.window.document.querySelectorAll('ul li');

  for (const valor of valores) {
    const texto = valor.textContent.replace(/\s+/g, '').trim().toLowerCase();
    if (!/(vaga|vagas)/.test(texto)) continue;

    const matchNumero = texto.match(/(\d+)/);
    return matchNumero ? parseInt(matchNumero[1], 10) : 0;
  }

  return 0;
}
