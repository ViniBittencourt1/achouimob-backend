// Extrai apenas o número de banheiros do HTML detalhado da rota interna
import { JSDOM } from 'jsdom';
export function extractBanheiroValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const containers = dom.window.document.querySelectorAll('div.DetailsPiecesProperties_container_caracters__i2IT3');
  for (const container of containers) {
    const title = container.querySelector('label.DetailsPiecesProperties_title_info_caracters__n3riW');
    if (title && /Banheiros/i.test(title.textContent)) {
      const result = container.querySelector('label.DetailsPiecesProperties_result_info_caracters__cRxMi');
      if (result) {
        // Extrai apenas o número inicial
        const match = result.textContent.trim().match(/^(\d+)/);
        if (match && match[1]) {
          return parseFloat(match[1]) || 0;
        }
      }
    }
  }
  return 0;
}
