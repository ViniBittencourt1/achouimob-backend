import * as googleSheets from "../../../services/googleSheets.js";
import { linhaSheets } from "../_utils/sheetsCampos.js";
import { exportarLinhasSheets } from "../_utils/imoveisSheets.js";

export const UBA_SPREADSHEET_ID =
  process.env.UBA_SHEETS_SPREADSHEET_ID || "1kBZdeaaD2q-Atu43I8k02zIEu8HrsNkqRFZ8TehaTWE";

export async function exportToSheets(data, options = {}, api = googleSheets) {
  const items = data instanceof Map ? Array.from(data.values()) : data;
  return exportarLinhasSheets(items.map(linhaSheets), {
    ...options, spreadsheetId: options.spreadsheetId ?? UBA_SPREADSHEET_ID,
  }, api);
}
