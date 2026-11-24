import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

export function extractAtualizadoEm() {
  const timeZone = "America/Sao_Paulo";
  return format(toZonedTime(new Date(), timeZone), "dd/MM/yyyy HH:mm:ss", { timeZone });
}
