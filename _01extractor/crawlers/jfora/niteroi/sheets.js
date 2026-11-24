import * as googleSheets from "../../../services/googleSheets.js";
import { linhaSheets } from "../_utils/sheetsCampos.js";
import {
  CABECALHO_IMOVEIS_SHEETS, mesclarLinhasSheets, exportarLinhasSheets,
} from "../_utils/imoveisSheets.js";
import { NITEROI_SPREADSHEET_ID } from "./projects.js";

export { NEGOCIACOES_SHEETS, negociacaoDaLinha } from "../_utils/imoveisSheets.js";
export const CABECALHO_SHEETS_NITEROI = CABECALHO_IMOVEIS_SHEETS;

export function montarLinhasNiteroi(dados, linhasAtuais, negociacao) {
  const itens = dados instanceof Map ? Array.from(dados.values()) : dados;
  return mesclarLinhasSheets(itens.map(linhaSheets), linhasAtuais, negociacao);
}

export async function exportToSheets(data, options = {}, api = googleSheets) {
  const itens = data instanceof Map ? Array.from(data.values()) : data;
  return exportarLinhasSheets(itens.map(linhaSheets), {
    ...options,
    spreadsheetId: options.spreadsheetId ?? NITEROI_SPREADSHEET_ID,
  }, api);
}
