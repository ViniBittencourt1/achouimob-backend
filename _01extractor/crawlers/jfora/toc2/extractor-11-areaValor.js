// Extrai o valor de área de um card HTML
// cardHtml: string (HTML do card)
import { JSDOM } from 'jsdom';

// Extrai área útil, depois área, e tenta pelo ícone SVG "Área Privativa" se existir
export function extractAreaValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const doc = dom.window.document;

  let areaValue = '';
  let found = false;

  // 1 - Busca pela estrutura do ícone SVG "Área Privativa" (Nova Prioridade)
  const containers = doc.querySelectorAll('div[class*="DetailsPiecesProperties_container_caracters"]');
  for (const container of containers) {
    const label = container.querySelector('label[class*="DetailsPiecesProperties_title_info_caracters"]');
    if (label && label.textContent && label.textContent.toLowerCase().includes('área privativa')) {
      // O valor está no próximo label
      const valueLabel = container.querySelector('label[class*="DetailsPiecesProperties_result_info_caracters"]');
      if (valueLabel) {
        const match = valueLabel.textContent.match(/(\d+[\.,]?\d*)/);
        if (match && match[1] && match[1] !== '0') {
          areaValue = match[1].replace(',', '.');
          found = true;
          break;
        }
      }
    }
  }

  // 2 - Busca por "útil" (util) se não encontrar anteriormente
  if (!found) {
    const utilElem = Array.from(doc.querySelectorAll('*')).find(el => {
      const txt = el.textContent.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      return txt.includes('util');
    });
    if (utilElem) {
      const match = utilElem.textContent.match(/(\d+[\.,]?\d*)/);
      if (match && match[1] && match[1] !== '0') {
        areaValue = match[1].replace(',', '.');
        found = true;
      }
    }
  }

  // 3 - Se não encontrar, busca por "área"
  if (!found) {
    const areaElem = Array.from(doc.querySelectorAll('*')).find(el => {
      const txt = el.textContent.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      return txt.includes('area');
    });
    if (areaElem) {
      const match = areaElem.textContent.match(/(\d+[\.,]?\d*)/);
      if (match && match[1] && match[1] !== '0') {
        areaValue = match[1].replace(',', '.');
        found = true;
      }
    }
  }

  // 4 - Se não encontrou, retorna vazio
  return found ? parseFloat(areaValue) || 0 : 0;
}