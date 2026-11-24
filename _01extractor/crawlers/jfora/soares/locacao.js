import { JF_SPREADSHEET_ID } from '../_utils/jfSheetsConfig.js';
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { abrirBrowser } from "../../../services/puppeteerPool.js";
import { extractSoaresLocacao, URL_LOCACAO_SOARES } from "./extractor-locacao.js";
import { consolidateData } from "./parser.js";
import { exportToSheets } from "./sheets.js";
import { contarAntesDaLocacaoSoares } from "../_utils/locacaoContagem.js";
import { sincronizarLocacao } from "../_utils/locacaoSincronizacao.js";

export const destinoSheetsLocacao = { spreadsheetId: JF_SPREADSHEET_ID, sheetName: "jfSoares" };
export const outputPathLocacao = fileURLToPath(new URL("../../../../crawler/jfSoaresLocacao.json", import.meta.url));

export async function main() {
  const existing = fs.existsSync(outputPathLocacao) ? JSON.parse(fs.readFileSync(outputPathLocacao, "utf8")) : [];
  const map = new Map(existing.map(item => [item.linkReal, item]));
  const codes = new Set(existing.map(item => String(item.codigoBase)));
  let browser;
  let imoveis;
  let totalEsperado;
  try {
    browser = await abrirBrowser();
    totalEsperado = await contarAntesDaLocacaoSoares(browser, { projeto: destinoSheetsLocacao.sheetName, url: URL_LOCACAO_SOARES });
    imoveis = totalEsperado === 0 ? [] : await extractSoaresLocacao(browser, new Set());
    if (!imoveis.length && totalEsperado !== 0) throw new Error("Nenhum aluguel extraido. JSON e Sheets anteriores preservados.");
  } finally { if (browser) await browser.close(); }
  await sincronizarLocacao({ imoveis, anteriores: map, imobiliaria: destinoSheetsLocacao.sheetName, outputPath: outputPathLocacao, exportToSheets, spreadsheetId: destinoSheetsLocacao.spreadsheetId, totalEsperado, vazioConfirmado: totalEsperado === 0 });
  console.log(`[SoaresLocacao] Concluido. imoveis salvos: ${imoveis.length}; JSON: ${outputPathLocacao}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error("[SoaresLocacao]", error.message); process.exitCode = 1; });
}