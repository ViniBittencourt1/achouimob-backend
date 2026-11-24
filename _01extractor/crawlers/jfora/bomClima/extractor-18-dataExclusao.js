
import fetch from 'node-fetch';
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";


// Extrai a data de exclusão: retorna data se o linkReal não existir (HTTP 404)
export async function extractDataExclusao(cardHtml, linkReal) {
  function getDataHoraBR() {
    const timeZone = "America/Sao_Paulo";
    const now = new Date();
    const zonedDate = toZonedTime(now, timeZone);
    return format(zonedDate, "dd/MM/yyyy HH:mm:ss", { timeZone });
  }

  if (!linkReal) return getDataHoraBR();
  try {
    const response = await fetch(linkReal, { method: 'HEAD' });
    if (response.status === 404) {
      return getDataHoraBR();
    }
    return '';
  } catch (e) {
    // Se erro de rede, assume excluído
    return getDataHoraBR();
  }
}
