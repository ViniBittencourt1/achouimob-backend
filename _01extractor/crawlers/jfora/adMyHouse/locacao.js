import { JF_SPREADSHEET_ID } from '../_utils/jfSheetsConfig.js';
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { abrirBrowser } from "../../../services/puppeteerPool.js";
import { extractAdMyHouseData } from "./extractor.js";
import { consolidateData } from "./parser.js";
import { exportToSheets } from "./sheets.js";
import { contarAntesDaLocacaoAcervo } from "../_utils/locacaoContagem.js";
import { sincronizarLocacao } from "../_utils/locacaoSincronizacao.js";

export const opcoesLocacao = {
  baseUrl: "https://www.admyhouse.com.br/imoveis/para-alugar/brasil?order=mais_relevantes",
  strict: true,
};
export const destinoSheetsLocacao = {
  spreadsheetId: JF_SPREADSHEET_ID,
  sheetName: "jfAdMyHouse",
};
export const outputPathLocacao = fileURLToPath(
  new URL("../../../../crawler/jfAdMyHouseLocacao.json", import.meta.url)
);

export async function main() {
  console.log("[AdMyHouseLocacao] Verificando imoveis para locacao...");
  const existeJson = fs.existsSync(outputPathLocacao);
  const existingData = existeJson ? JSON.parse(fs.readFileSync(outputPathLocacao, "utf-8")) : [];
  const existingDataMap = new Map(existingData.map((item) => [item.linkReal, item]));
  const existingCodes = new Set(existingData.map((item) => String(item.codigoBase)));
  const modos = [true];
  let result;
  let totalEsperado;

  for (const [tentativa, headlessOverride] of modos.entries()) {
    let browser;
    try {
      browser = await abrirBrowser({ headlessOverride });
      totalEsperado = await contarAntesDaLocacaoAcervo(browser, { projeto: destinoSheetsLocacao.sheetName, url: opcoesLocacao.baseUrl });
      result = await extractAdMyHouseData(browser, new Set(), { ...opcoesLocacao, totalEsperado });
      break;
    } catch (error) {
      if (error.code !== "ADMYHOUSE_BLOCKED" || tentativa === modos.length - 1) throw error;
      console.warn("[AdMyHouseLocacao] Bloqueio detectado em modo headless.");
    } finally {
      if (browser) await browser.close();
    }
  }

  const imoveis = result.imoveisRaspados;
  if (!imoveis.length) {
    if (!result.semImoveisConfirmado) {
      throw new Error("Coleta vazia nao confirmada pelo site. Dados anteriores preservados.");
    }
    await sincronizarLocacao({ imoveis, anteriores: existingDataMap, imobiliaria: destinoSheetsLocacao.sheetName, outputPath: outputPathLocacao, exportToSheets, spreadsheetId: destinoSheetsLocacao.spreadsheetId, totalEsperado, vazioConfirmado: true });
    return;
  }

  await sincronizarLocacao({ imoveis, anteriores: existingDataMap, imobiliaria: destinoSheetsLocacao.sheetName, outputPath: outputPathLocacao, exportToSheets, spreadsheetId: destinoSheetsLocacao.spreadsheetId, totalEsperado });
  console.log(`[AdMyHouseLocacao] Concluido. imoveis salvos: ${imoveis.length}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("[AdMyHouseLocacao] Erro:", error.message);
    process.exitCode = 1;
  });
}