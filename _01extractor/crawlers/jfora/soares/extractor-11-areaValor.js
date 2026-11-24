// Extrai o valor de área de um card HTML
// cardHtml: string (HTML do card)
import { JSDOM } from 'jsdom';
export function extractAreaValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  // 1 - Busca área útil
  let li = dom.window.document.querySelector('li[ng-if*="imovel.areaUtil"]');
  if (li) {
    const strong = li.querySelector('strong.ng-binding');
    if (strong) {
      const match = strong.textContent.match(/(\d+[\.,]?\d*)\s*m²/);
      if (match && match[1] && match[1] !== '0') {
        return parseFloat(match[1].replace(',', '.')) || 0;
      }
    }
  }
  // 2 - Se não encontrar, busca área total
  li = dom.window.document.querySelector('li[ng-if*="imovel.areaTotal"]');
  if (li) {
    const strong = li.querySelector('strong.ng-binding');
    if (strong) {
      const match = strong.textContent.match(/(\d+[\.,]?\d*)\s*m²/);
      if (match && match[1] && match[1] !== '0') {
        return parseFloat(match[1].replace(',', '.')) || 0;
      }
    }
  }
  // Se não encontrar, retorna 0
  return 0;
  if (section) {
    const utilElem = Array.from(section.querySelectorAll('*')).find(el => {
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
    if (!found) {
      const areaElem = Array.from(section.querySelectorAll('*')).find(el => {
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
  }
  // Se não encontrou, busca em div.tags ou div#desc_tags
  if (!found) {
    const tagsDiv = dom.window.document.querySelector('div.tags, div#desc_tags');
    if (tagsDiv) {
      const utilElem = Array.from(tagsDiv.querySelectorAll('p')).find(p => {
        const txt = p.textContent.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        return txt.includes('util');
      });
      if (utilElem) {
        const match = utilElem.textContent.match(/(\d+[\.,]?\d*)/);
        if (match && match[1] && match[1] !== '0') {
          areaValue = match[1].replace(',', '.');
          found = true;
        }
      }
      if (!found) {
        const areaElem = Array.from(tagsDiv.querySelectorAll('p')).find(p => {
          const txt = p.textContent.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
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
    }
  }
  if (found) return areaValue;
  // 3 - Se nada encontrado na rota interna, retorna 0
  return '0';
}
