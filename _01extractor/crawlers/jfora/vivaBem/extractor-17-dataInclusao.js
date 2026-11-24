import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

export const extractDataInclusao = getDataInclusao;
// Retorna a data de inclusÃ£o do linkReal no banco de dados
// Pode ser chamada no momento da inserÃ§Ã£o
export function getDataInclusao() {
  // Fuso horÃ¡rio de SÃ£o Paulo
  const timeZone = "America/Sao_Paulo";
  const now = new Date();
  const zonedDate = toZonedTime(now, timeZone);
  // Formato brasileiro: dd/MM/yyyy HH:mm:ss
  return format(zonedDate, "dd/MM/yyyy HH:mm:ss", { timeZone });
}
