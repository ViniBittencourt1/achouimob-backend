import { backendEnvPath as ISOLATED_BACKEND_ENV } from '../../../../backend-paths.cjs';
import { exportarLinhasSheets } from "../_utils/imoveisSheets.js";
import { JF_SPREADSHEET_ID } from "../_utils/jfSheetsConfig.js";
// backend/src/crawlers/jfora/invest/sheets.js
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import dotenv from "dotenv";
dotenv.config({ path: ISOLATED_BACKEND_ENV });

// 🔄 Nome da aba no Google Sheets

function formatTimestamp(value) {
  const timeZone = "America/Sao_Paulo";

  if (!value) return "";

  // Ja esta no formato final desejado
  if (
    typeof value === "string" &&
    /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/.test(value)
  ) {
    return value;
  }

  // Timestamp do Firestore
  if (
    typeof value === "object" &&
    value._seconds !== undefined &&
    value._nanoseconds !== undefined
  ) {
    const milliseconds = value._seconds * 1000 + value._nanoseconds / 1000000;
    const zonedDate = toZonedTime(new Date(milliseconds), timeZone);
    return format(zonedDate, "dd/MM/yyyy HH:mm:ss", { timeZone });
  }

  // Date nativo
  if (value instanceof Date) {
    const zonedDate = toZonedTime(value, timeZone);
    return format(zonedDate, "dd/MM/yyyy HH:mm:ss", { timeZone });
  }

  // String ISO e afins
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      const zonedDate = toZonedTime(parsed, timeZone);
      return format(zonedDate, "dd/MM/yyyy HH:mm:ss", { timeZone });
    }
    return value;
  }

  return String(value);
}

export async function exportInvestDataToSheets(dados, options = {}, api) {
  const dadosArray = dados instanceof Map ? Array.from(dados.values()) : dados;
  const linhas = dadosArray.map(i => [
    i.linkReal ?? "",
    i.titulo ?? "",
    i.preco ?? "",
    i.localizacao ?? "",
    i.tipoImovel ?? "",
    i.bairro ?? "",
    i.cidade ?? "",
    i.dormitorioValor ?? "",
    i.banheiroValor ?? "",
    i.ambienteValor ?? "",
    i.areaValor ?? "",
    i.garagemValor ?? "",
    i.elevadorValor ?? "",
    i.codigoBase ?? "",
    i.linkCard ?? "",
    i.corretor ?? "",
    formatTimestamp(i.dataInclusao),
    formatTimestamp(i.dataExclusao),
    i.linkFoto ?? "",
    formatTimestamp(i.atualizadoEm)
  ]);
  return exportarLinhasSheets(linhas, {
    ...options,
    spreadsheetId: options.spreadsheetId ?? JF_SPREADSHEET_ID,
    sheetName: options.sheetName ?? "jfInvest",
  }, api);
}

export async function exportToSheets(dados, options = {}, api) {
  return exportInvestDataToSheets(dados, options, api);
}
