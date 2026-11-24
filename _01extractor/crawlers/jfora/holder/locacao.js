import { JF_SPREADSHEET_ID } from '../_utils/jfSheetsConfig.js';
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { abrirBrowser } from "../../../services/puppeteerPool.js";
import { contarHolder, extractHolderData } from "./extractor.js";
import { exportToSheets } from "./sheets.js";
import { registrarTotalLocacao } from "../_utils/locacaoContagem.js";
import { sincronizarLocacao } from "../_utils/locacaoSincronizacao.js";

export const destinoSheetsLocacao = { spreadsheetId: JF_SPREADSHEET_ID, sheetName: "jfHolder" };
export const outputPathLocacao = fileURLToPath(new URL("../../../../crawler/jfHolderLocacao.json", import.meta.url));

export async function main() {
  const existing = fs.existsSync(outputPathLocacao) ? JSON.parse(fs.readFileSync(outputPathLocacao, "utf8")) : [];
  const existingMap = new Map(existing.map(item => [item.linkReal, item]));
  let browser;
  let imoveis;
  let totalEsperado;
  try {
    browser = await abrirBrowser();
    totalEsperado = await contarHolder(browser, "locacao");
    await registrarTotalLocacao(destinoSheetsLocacao.sheetName, totalEsperado);
    imoveis = totalEsperado === 0 ? [] : (await extractHolderData(browser, new Set(), { modo: "locacao" })).imoveisRaspados;
  } finally {
    if (browser) await browser.close();
  }
  await sincronizarLocacao({ imoveis, anteriores: existingMap, imobiliaria: destinoSheetsLocacao.sheetName, outputPath: outputPathLocacao, exportToSheets, spreadsheetId: destinoSheetsLocacao.spreadsheetId, totalEsperado, vazioConfirmado: totalEsperado === 0 });
  console.log(`[HolderLocacao] Concluido. imoveis salvos: ${imoveis.length}; JSON: ${outputPathLocacao}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error("[HolderLocacao]", error.message);
    process.exitCode = 1;
  });
}
