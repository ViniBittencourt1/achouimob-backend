// Extrai o valor de área de um card HTML
// cardHtml: string (HTML do card)
import { JSDOM } from 'jsdom';
export function extractAreaValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  // 1 - Rota Externa: busca pelo bloco com ícone fa-arrows-h
  const areaDiv = dom.window.document.querySelector('div.imovelcard__info__feature > i.fa.fa-arrows-h');
  if (areaDiv) {
    const parent = areaDiv.parentElement;
    if (parent) {
      const p = parent.querySelector('p');
      if (p) {
        const b = p.querySelector('b');
        if (b && /m²/.test(b.textContent)) {
          const match = b.textContent.match(/(\d+[\.,]?\d*)\s*m²/);
          if (match && match[1] && match[1] !== '0') {
            return parseFloat(match[1].replace(',', '.')) || 0;
          }
        }
      }
    }
    // Se não encontrou valor na rota externa, retorna vazio
    return '';
  }

  // 2 - Rota Interna: busca em section.imovel-info-interna ou div.tags (desc_tags)
  let found = false;
  let areaValue = '0';
  // Busca em section.imovel-info-interna
  const section = dom.window.document.querySelector('section.imovel-info-interna');
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
  if (found) return parseFloat(areaValue) || 0;
  // 3 - Se nada encontrado na rota interna, retorna 0
  return 0;
}
