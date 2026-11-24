import { exportarLinhasSheets } from "../_utils/imoveisSheets.js";
import { JF_SPREADSHEET_ID } from "../_utils/jfSheetsConfig.js";
// backend/src/crawlers/jfora/bargon/sheets.js

// Função auxiliar para converter o objeto de timestamp do Firebase/Firestore em uma string de data/hora.
function formatTimestamp(timestampObject) {
  if (
    timestampObject &&
    typeof timestampObject === "object" &&
    timestampObject._seconds !== undefined &&
    timestampObject._nanoseconds !== undefined
  ) {
    const milliseconds =
      timestampObject._seconds * 1000 + timestampObject._nanoseconds / 1000000;

    const date = new Date(milliseconds);
    return date.toLocaleString("pt-BR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }
  return timestampObject instanceof Date ? timestampObject.toISOString() : timestampObject ?? "";
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
    sheetName: options.sheetName ?? "jfBargon",
  }, api);
}
