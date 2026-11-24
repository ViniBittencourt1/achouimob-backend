import { JSDOM } from 'jsdom';

// Extrai o valor numérico de elevadores do card HTML
export function extractElevadorValor(cardHtml) {
  const doc = JSDOM.fragment(cardHtml);
  const small = doc.querySelector("div.imovel--icon[data-icon='elevadores'] small");
    return 0;
}
