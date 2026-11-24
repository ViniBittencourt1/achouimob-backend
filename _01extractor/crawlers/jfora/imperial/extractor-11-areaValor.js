// Extrai o valor de área de um card HTML
// cardHtml: string (HTML do card)
import { JSDOM } from 'jsdom';
export function extractAreaValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  // 1 - Rota Externa: busca pelo icone fa-arrows-h (formato real do card na listagem)
  const icone = dom.window.document.querySelector('i.fa-arrows-h');
  if (icone) {
    const container = icone.closest('a, td');
    const texto = container ? container.textContent.trim() : '';
    const match = texto.match(/(\d+[\.,]?\d*)\s*m/);
    return match && match[1] ? parseFloat(match[1].replace(',', '.')) || 0 : 0;
  }

  // 2 - Rota Interna (pagina de detalhes): o h1.interna__title tem um <span> com o
  // resumo completo do imovel, incluindo "area total X,XX m2" / "area util X,XX m2".
  const h1 = dom.window.document.querySelector('h1.interna__title');
  if (h1) {
    const textoNormalizado = h1.textContent.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const matchArea = textoNormalizado.match(/area (?:util|total)\s*([\d.,]+)/);
    if (matchArea && matchArea[1]) {
      const valor = parseFloat(matchArea[1].replace(/\.(?=\d{3})/g, '').replace(',', '.'));
      if (valor > 0) return valor;
    }
  }

  // 3 - Rota Interna (formato antigo): busca em section.imovel-info-interna ou div.tags (desc_tags)
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
