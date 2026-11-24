// Extrai o valor de garagem de um card HTML
// cardHtml: string (HTML do card)
import { JSDOM } from 'jsdom';

// Extrai o valor de vagas de garagem usando a estrutura do HTML fornecido
export function extractGaragemValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const doc = dom.window.document;

  // Busca pela estrutura do ícone SVG e label "Vagas"
  const containers = doc.querySelectorAll('div[class*="DetailsPiecesProperties_container_caracters"]');
  for (const container of containers) {
    const label = container.querySelector('label[class*="DetailsPiecesProperties_title_info_caracters"]');
    if (label && label.textContent && label.textContent.toLowerCase().includes('vaga')) {
      // O valor está no próximo label
      const valueLabel = container.querySelector('label[class*="DetailsPiecesProperties_result_info_caracters"]');
      if (valueLabel) {
        const match = valueLabel.textContent.match(/(\d+)/);
        if (match && match[1]) {
          return parseFloat(match[1]) || 0;
        }
      }
    }
  }
  // Se não encontrar, retorna 0
  return 0;
}
