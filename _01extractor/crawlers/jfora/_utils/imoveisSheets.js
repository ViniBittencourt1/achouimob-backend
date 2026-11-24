import * as googleSheets from "../../../services/googleSheets.js";
import { CABECALHO_SHEETS } from "./sheetsCampos.js";

export const NEGOCIACOES_SHEETS = Object.freeze(["venda", "aluguel"]);
export const CABECALHO_IMOVEIS_SHEETS = Object.freeze([...CABECALHO_SHEETS, "negociacao"]);
const COLUNA_NEGOCIACAO = CABECALHO_SHEETS.length;

function colunaPlanilha(index) {
  let column = "";
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    column = String.fromCharCode(65 + (value - 1) % 26) + column;
  }
  return column;
}

function validarColunasExtras(extraColumns) {
  if (!Array.isArray(extraColumns) || extraColumns.some(column => typeof column !== "string" || !column.trim())) {
    throw new Error("Colunas extras invalidas para exportacao.");
  }
  const columns = extraColumns.map(column => column.trim());
  if (new Set(columns).size !== columns.length || columns.some(column => CABECALHO_SHEETS.includes(column) || column === "negociacao")) {
    throw new Error("Colunas extras duplicadas ou reservadas para exportacao.");
  }
  return columns;
}

export function negociacaoDaLinha(row, column = COLUNA_NEGOCIACAO) {
  const value = String(row?.[column] ?? "").trim().toLowerCase();
  if (value && !NEGOCIACOES_SHEETS.includes(value)) {
    throw new Error(`Negociacao desconhecida na aba: ${value}; dados preservados.`);
  }
  // As abas principais antigas continham apenas vendas.
  return value || "venda";
}

export function mesclarLinhasSheets(novas, linhasAtuais, negociacao, extraColumns = []) {
  if (!NEGOCIACOES_SHEETS.includes(negociacao)) throw new Error(`Negociacao invalida para o Sheets: ${negociacao}`);
  const extras = validarColunasExtras(extraColumns);
  const cabecalhoEsperado = [...CABECALHO_SHEETS, "negociacao", ...extras];
  const [cabecalho, ...corpo] = linhasAtuais;
  const cabecalhoCompleto = cabecalho?.length === cabecalhoEsperado.length &&
    cabecalhoEsperado.every((campo, index) => String(cabecalho[index] ?? "").trim() === campo);
  const cabecalhoLegado = [CABECALHO_SHEETS, CABECALHO_IMOVEIS_SHEETS].some(esperado =>
    cabecalho?.length === esperado.length &&
    esperado.every((campo, index) => String(cabecalho[index] ?? "").trim() === campo)
  );
  const cabecalhoComExtrasAnteriores = cabecalho?.length > CABECALHO_IMOVEIS_SHEETS.length &&
    cabecalho.length < cabecalhoEsperado.length &&
    CABECALHO_IMOVEIS_SHEETS.every((campo, index) => String(cabecalho[index] ?? "").trim() === campo) &&
    cabecalho.slice(CABECALHO_IMOVEIS_SHEETS.length)
      .every((campo, index) => String(campo ?? "").trim() === extras[index]);
  if (cabecalho?.some(value => String(value ?? "").trim()) && !cabecalhoCompleto && !cabecalhoLegado && !cabecalhoComExtrasAnteriores) {
    throw new Error("Cabecalho da aba incompativel; registros da outra negociacao preservados.");
  }
  const cabecalhoTemNegociacao = cabecalhoCompleto || cabecalhoLegado && cabecalho.length > COLUNA_NEGOCIACAO || cabecalhoComExtrasAnteriores;
  const cabecalhoTemExtras = cabecalhoCompleto || cabecalhoComExtrasAnteriores;
  const preservadas = corpo
    .filter(row => row.some(value => String(value ?? "").trim() !== ""))
    .filter(row => !(row[COLUNA_NEGOCIACAO] === "Erro no site" && !row[0]))
    .map(row => {
      const currentNegotiation = cabecalhoTemNegociacao ? negociacaoDaLinha(row) : "venda";
      const values = Array.from({ length: COLUNA_NEGOCIACAO }, (_, index) => row[index] ?? "");
      const extraValues = cabecalhoTemExtras
        ? extras.map(column => {
          const index = cabecalho.findIndex(value => String(value ?? "").trim() === column);
          return index >= 0 ? row[index] ?? "" : "";
        })
        : extras.map(() => "");
      return [...values, currentNegotiation, ...extraValues];
    })
    .filter(row => row[COLUNA_NEGOCIACAO] !== negociacao);
  if (novas.some(row => !Array.isArray(row) || row.length !== COLUNA_NEGOCIACAO + extras.length)) {
    throw new Error("Linhas de exportacao incompativeis; dados preservados.");
  }
  const novasComNegociacao = novas.map(row => [
    ...row.slice(0, COLUNA_NEGOCIACAO),
    negociacao,
    ...row.slice(COLUNA_NEGOCIACAO),
  ]);
  return [...novasComNegociacao, ...preservadas]
    .sort((a, b) => NEGOCIACOES_SHEETS.indexOf(a[COLUNA_NEGOCIACAO]) - NEGOCIACOES_SHEETS.indexOf(b[COLUNA_NEGOCIACAO]));
}

export async function exportarLinhasSheets(novas, options, api = googleSheets) {
  const { spreadsheetId, sheetName, negociacao = "venda", sheetId } = options;
  const extraColumns = validarColunasExtras(options.extraColumns ?? []);
  const header = [...CABECALHO_SHEETS, "negociacao", ...extraColumns];
  const lastColumn = colunaPlanilha(header.length - 1);
  if (!spreadsheetId || !sheetName) throw new Error("Planilha e nome da aba obrigatorios para exportacao.");
  if (!NEGOCIACOES_SHEETS.includes(negociacao)) throw new Error(`Negociacao invalida para o Sheets: ${negociacao}`);
  const title = sheetId !== undefined
    ? await api.getSheetTitleById(spreadsheetId, sheetId)
    : sheetName;
  const aba = await api.ensureSheet(spreadsheetId, title, header.length);
  const range = `'${aba.replace(/'/g, "''")}'`;
  const atuais = await api.readSheet(spreadsheetId, `${range}!A:${lastColumn}`, { valueRenderOption: "UNFORMATTED_VALUE" });
  const linhas = mesclarLinhasSheets(novas, atuais, negociacao, extraColumns);
  await api.ensureSheet(spreadsheetId, aba, header.length, linhas.length + 1);
  await api.clearSheet(spreadsheetId, aba);
  await api.writeHeader(spreadsheetId, aba, header);
  if (sheetId !== undefined) await api.setSheetNumberFormat(spreadsheetId, sheetId, 2);
  if (linhas.length) await api.writeSheet(spreadsheetId, `${range}!A2:${lastColumn}${linhas.length + 1}`, linhas);
  console.log(`[Sheets] ${novas.length} linhas de ${negociacao} enviadas para ${aba}; ${linhas.length - novas.length} da outra negociacao preservadas.`);
}
