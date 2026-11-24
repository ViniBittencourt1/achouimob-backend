import { exportarLinhasSheets } from "../_utils/imoveisSheets.js";
import { JF_SPREADSHEET_ID } from "../_utils/jfSheetsConfig.js";
import { linhaSheets } from "../_utils/sheetsCampos.js";

export { CABECALHO_SHEETS, linhaSheets } from "../_utils/sheetsCampos.js";

export async function exportToSheets(dados, options = {}, api) {
  const dadosArray = dados instanceof Map ? Array.from(dados.values()) : dados;
  return exportarLinhasSheets(dadosArray.map(linhaSheets), {
    ...options,
    spreadsheetId: options.spreadsheetId ?? JF_SPREADSHEET_ID,
    sheetName: options.sheetName ?? "jfTriade",
  }, api);
}
