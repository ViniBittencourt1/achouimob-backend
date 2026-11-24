import { exportarLinhasSheets } from "../_utils/imoveisSheets.js";
import { JF_SPREADSHEET_ID } from "../_utils/jfSheetsConfig.js";

const HEADER = [
  "linkReal", "titulo", "preco", "localizacao", "tipoImovel", "bairro", "cidade",
  "dormitorioValor", "banheiroValor", "ambienteValor", "areaValor", "garagemValor",
  "elevadorValor", "codigoBase", "linkCard", "corretor", "dataInclusao", "dataExclusao",
  "linkFoto", "atualizadoEm",
];

export async function exportToSheets(dados, options = {}, api) {
  const dadosArray = dados instanceof Map ? Array.from(dados.values()) : dados;
  const linhas = dadosArray.map((item) => HEADER.map((campo) => item[campo] ?? ""));
  return exportarLinhasSheets(linhas, {
    ...options,
    spreadsheetId: options.spreadsheetId ?? JF_SPREADSHEET_ID,
    sheetName: options.sheetName ?? "jfHolder",
  }, api);
}
