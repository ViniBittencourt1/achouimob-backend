import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

// Retorna a data de inclusão do linkReal no banco de dados
// Pode ser chamada no momento da inserção
export function extractDataInclusao() {
  const timeZone = "America/Sao_Paulo";
  const now = new Date();
  const zonedDate = toZonedTime(now, timeZone);
  return format(zonedDate, "dd/MM/yyyy HH:mm:ss", { timeZone });
}
