import { JF_SPREADSHEET_ID } from '../_utils/jfSheetsConfig.js';
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { abrirBrowser } from "../../../services/puppeteerPool.js";
import { extractLiderLocacao, URL_LOCACAO_LIDER } from "./extractor-locacao.js";
import { consolidateData } from "./parser.js";
import { exportToSheets } from "./sheets.js";
import { contarAntesDaLocacaoImobBrasil } from "../_utils/locacaoContagem.js";
import { sincronizarLocacao } from "../_utils/locacaoSincronizacao.js";

export const destinoSheetsLocacao = { spreadsheetId: JF_SPREADSHEET_ID, sheetName: "jfLider" };
export const outputPathLocacao = fileURLToPath(new URL("../../../../crawler/jfLiderLocacao.json", import.meta.url));

export async function main() {
  const existing = fs.existsSync(outputPathLocacao) ? JSON.parse(fs.readFileSync(outputPathLocacao, "utf8")) : [];
  const existingMap = new Map(existing.map(item => [item.linkReal, item]));
  let imoveis;
  let totalEsperado;
  let browser;
  try {
    browser = await abrirBrowser({ headlessOverride: true });
    totalEsperado = await contarAntesDaLocacaoImobBrasil(browser, { projeto: destinoSheetsLocacao.sheetName, url: URL_LOCACAO_LIDER });
    const records = await extractLiderLocacao(browser, { totalEsperado });
    if (!records.length && totalEsperado !== 0) throw new Error("Nenhum aluguel encontrado. JSON e Sheets anteriores preservados.");
    imoveis = records;
  } finally { if (browser) await browser.close(); }
  await sincronizarLocacao({ imoveis, anteriores: existingMap, imobiliaria: destinoSheetsLocacao.sheetName, outputPath: outputPathLocacao, exportToSheets, spreadsheetId: destinoSheetsLocacao.spreadsheetId, totalEsperado, vazioConfirmado: totalEsperado === 0 });
  console.log(`[LiderLocacao] Concluido. imoveis salvos: ${imoveis.length}; JSON: ${outputPathLocacao}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error("[LiderLocacao]", error.message);
    process.exitCode = 1;
  });
}