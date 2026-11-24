import * as googleSheets from "../../../services/googleSheets.js";
import { linhaSheets } from "../_utils/sheetsCampos.js";
import { exportarLinhasSheets } from "../_utils/imoveisSheets.js";
import { RIO_SPREADSHEET_ID } from "./projects.js";

export async function exportToSheets(data, options = {}, api = googleSheets) {
  const items = data instanceof Map ? [...data.values()] : data;
  return exportarLinhasSheets(items.map(linhaSheets), {
    ...options, spreadsheetId: options.spreadsheetId ?? RIO_SPREADSHEET_ID,
  }, api);
}
