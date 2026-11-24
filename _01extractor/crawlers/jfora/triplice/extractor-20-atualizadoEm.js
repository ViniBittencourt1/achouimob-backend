import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

// Retorna a data de atualizaÃ§Ã£o do registro
// Deve ser gravada ao final do processo de raspagem e salvamento
export function extractAtualizadoEm() {
  const timeZone = "America/Sao_Paulo";
  const now = new Date();
  const zonedDate = toZonedTime(now, timeZone);
  return format(zonedDate, "dd/MM/yyyy HH:mm:ss", { timeZone });
}
