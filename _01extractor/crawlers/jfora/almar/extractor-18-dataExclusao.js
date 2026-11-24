import { JSDOM } from 'jsdom';
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

// Extrai a data de exclusão: só retorna data se codigoBase não for encontrado
export function extractDataExclusao(cardHtml) {
  // Função utilitária para data/hora brasileira
  function getDataHoraBR() {
    const timeZone = "America/Sao_Paulo";
    const now = new Date();
    const zonedDate = toZonedTime(now, timeZone);
    return format(zonedDate, "dd/MM/yyyy HH:mm:ss", { timeZone });
  }

  if (!cardHtml) return getDataHoraBR();
  const dom = new JSDOM(cardHtml);
  const span = dom.window.document.querySelector('div.imovel-item--cod span');
  const codigoBase = span ? span.textContent.match(/\d+/) : null;
  if (!codigoBase) {
    return getDataHoraBR();
  }
  return '';
}
