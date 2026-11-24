import { exportarLinhasSheets } from "../_utils/imoveisSheets.js";
import { JF_SPREADSHEET_ID } from "../_utils/jfSheetsConfig.js";
// backend/src/crawlers/jfora/start/sheets.js
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

// Função auxiliar para converter o objeto de timestamp do Firebase/Firestore em uma string de data/hora.
function formatTimestamp(timestampObject) {
  const timeZone = "America/Sao_Paulo";

  if (!timestampObject) return "";

  // Já está no formato final desejado
  if (
    typeof timestampObject === "string" &&
    /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/.test(timestampObject)
  ) {
    return timestampObject;
  }

  if (
    timestampObject &&
    typeof timestampObject === "object" &&
    timestampObject._seconds !== undefined &&
    timestampObject._nanoseconds !== undefined
  ) {
    const milliseconds =
      timestampObject._seconds * 1000 + timestampObject._nanoseconds / 1000000;

    const zonedDate = toZonedTime(new Date(milliseconds), timeZone);
    return format(zonedDate, "dd/MM/yyyy HH:mm:ss", { timeZone });
  }

  if (timestampObject instanceof Date) {
    const zonedDate = toZonedTime(timestampObject, timeZone);
    return format(zonedDate, "dd/MM/yyyy HH:mm:ss", { timeZone });
  }

  if (typeof timestampObject === "string") {
    const parsed = new Date(timestampObject);
    if (!Number.isNaN(parsed.getTime())) {
      const zonedDate = toZonedTime(parsed, timeZone);
      return format(zonedDate, "dd/MM/yyyy HH:mm:ss", { timeZone });
    }
    return timestampObject;
  }

  return String(timestampObject);
}

export async function exportToSheets(dados, options = {}, api) {
  const dadosArray = dados instanceof Map ? Array.from(dados.values()) : dados;
  const linhas = dadosArray.map((item) => [
    item.linkReal ?? "",
    item.titulo ?? "",
    item.preco ?? "",
    item.localizacao ?? "",
    item.tipoImovel ?? "",
    item.bairro ?? "",
    item.cidade ?? "",
    item.dormitorioValor ?? "",
    item.banheiroValor ?? "",
    item.ambienteValor ?? "",
    item.areaValor ?? "",
    item.garagemValor ?? "",
    item.elevadorValor ?? "",
    item.codigoBase ?? "",
    item.linkCard ?? "",
    item.corretor ?? "",
    formatTimestamp(item.dataInclusao),
    formatTimestamp(item.dataExclusao),
    item.linkFoto ?? "",
    formatTimestamp(item.atualizadoEm)
  ]);
  return exportarLinhasSheets(linhas, {
    ...options,
    spreadsheetId: options.spreadsheetId ?? JF_SPREADSHEET_ID,
    sheetName: options.sheetName ?? "jfStart",
  }, api);
}
