import { exportarLinhasSheets } from "../_utils/imoveisSheets.js";
import { JF_SPREADSHEET_ID } from "../_utils/jfSheetsConfig.js";
// backend/src/crawlers/jfora/remax/sheets.js
import nomesRemax from '../../../../formatarNomeRemax.cjs';
const { formatarNomeRemax } = nomesRemax;

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

// Função auxiliar para converter o objeto de timestamp do Firebase/Firestore em uma string de data/hora.
function formatTimestamp(timestampObject) {
  let date;
  if (
    timestampObject &&
    typeof timestampObject === "object" &&
    timestampObject._seconds !== undefined &&
    timestampObject._nanoseconds !== undefined
  ) {
    const milliseconds =
      timestampObject._seconds * 1000 + timestampObject._nanoseconds / 1000000;

    date = new Date(milliseconds);
  } else if (timestampObject instanceof Date) {
    date = timestampObject;
  } else if (typeof timestampObject === "string" && /^\d{4}-\d{2}-\d{2}T/.test(timestampObject)) {
    date = new Date(timestampObject);
  } else {
    return timestampObject ?? "";
  }
  if (Number.isNaN(date.getTime())) return timestampObject ?? "";
  const parts = Object.fromEntries(dateTimeFormatter.formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`;
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
    formatarNomeRemax(item.corretor ?? ""),
    formatTimestamp(item.dataInclusao),
    formatTimestamp(item.dataExclusao),
    item.linkFoto ?? "",
    formatTimestamp(item.atualizadoEm)
  ]);
  return exportarLinhasSheets(linhas, {
    ...options,
    spreadsheetId: options.spreadsheetId ?? JF_SPREADSHEET_ID,
    sheetName: options.sheetName ?? "jfRemax",
  }, api);
}
