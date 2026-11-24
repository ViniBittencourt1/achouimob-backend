
import { JSDOM } from 'jsdom';

// Extrai o valor de garagem de um card HTML
// cardHtml: string (HTML do card)
export function extractGaragemValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  // Procura o container de característica de garagem
  const containers = dom.window.document.querySelectorAll('div.Caracteristica_characterContainer__LjUy6');
  for (const container of containers) {
    const icon = container.querySelector('i.fa-light.fa-car.text-primary');
    if (icon) {
      // O valor está no <span> logo após o ícone
      const span = container.querySelector('span.Caracteristica_active__ZNTcs.Caracteristica_title__vzVJS');
      if (span) {
        const match = span.textContent.match(/(\d+)/);
        if (match) {
          return parseInt(match[1], 10);
        }
      }
    }
  }
  return 0;
}
