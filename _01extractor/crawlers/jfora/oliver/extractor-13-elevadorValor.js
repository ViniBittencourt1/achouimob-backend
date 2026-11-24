import { JSDOM } from 'jsdom';

// Extrai o valor numÃ©rico de elevadores do card HTML
export function extractElevadorValor(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const small = dom.window.document.querySelector("div.imovel--icon[data-icon='elevadores'] small");
    return 0;
}
