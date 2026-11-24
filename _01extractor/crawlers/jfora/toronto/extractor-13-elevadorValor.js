import { JSDOM } from '../_utils/cachedJSDOM.js';

// Extrai o valor numérico de elevadores do card HTML
export function extractElevadorValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const small = dom.window.document.querySelector("div.imovel--icon[data-icon='elevadores'] small");
    return 0;
}
