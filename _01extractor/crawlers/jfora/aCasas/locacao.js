import { JF_SPREADSHEET_ID } from '../_utils/jfSheetsConfig.js';
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { abrirBrowser } from "../../../services/puppeteerPool.js";
import { extractACasasData } from "./extractor.js";
import { consolidateData } from "./parser.js";
import { exportToSheets } from "./sheets.js";
import { contarAntesDaLocacaoColibex } from "../_utils/locacaoContagem.js";
import { sincronizarLocacao } from "../_utils/locacaoSincronizacao.js";

export const opcoesLocacao = {
  baseUrl: "https://acasas.com.br/pesquisa?transacao=Loca%C3%A7%C3%A3o&ordena=menor_valor",
  incluirTaxas: true,
  preservarPreco: true,
  strict: true,
};
export const destinoSheetsLocacao = {
  spreadsheetId: JF_SPREADSHEET_ID,
  sheetName: "jfACasas",
};
export const outputPathLocacao = fileURLToPath(
  new URL("../../../../crawler/jfACasasLocacao.json", import.meta.url)
);

export async function main() {
  console.log("[ACasasLocacao] Iniciando raspagem de alugueis...");
  const existingData = fs.existsSync(outputPathLocacao)
    ? JSON.parse(fs.readFileSync(outputPathLocacao, "utf-8"))
    : [];
  const existingDataMap = new Map(existingData.map((item) => [item.linkReal, item]));
  const existingCodes = new Set(existingData.map((item) => String(item.codigoBase)));
  const modos = process.env.CRAWLER_HEADLESS === "true" ? [true, false] : [undefined];
  let imoveis = [];
  let totalEsperado;

  for (const [tentativa, headlessOverride] of modos.entries()) {
    let browser;
    try {
      browser = await abrirBrowser({ headlessOverride });
      totalEsperado = await contarAntesDaLocacaoColibex(browser, { projeto: destinoSheetsLocacao.sheetName, url: opcoesLocacao.baseUrl });
      if (totalEsperado === 0) { imoveis = []; break; }
      const result = await extractACasasData(browser, new Set(), opcoesLocacao);
      imoveis = result.imoveisRaspados;
      if (imoveis.length) break;
    } catch (error) {
      if (error.code !== "ACASAS_BLOCKED" || tentativa === modos.length - 1) throw error;
      console.warn("[ACasasLocacao] Bloqueio em headless. Tentando navegador visivel...");
    } finally {
      if (browser) await browser.close();
    }
  }

  if (!imoveis.length && totalEsperado !== 0) {
    throw new Error("Nenhum aluguel extraido. JSON e planilha anteriores foram preservados.");
  }
  await sincronizarLocacao({ imoveis, anteriores: existingDataMap, imobiliaria: destinoSheetsLocacao.sheetName, outputPath: outputPathLocacao, exportToSheets, spreadsheetId: destinoSheetsLocacao.spreadsheetId, totalEsperado, vazioConfirmado: totalEsperado === 0 });
  console.log(`[ACasasLocacao] Concluido. imoveis salvos: ${imoveis.length}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("[ACasasLocacao] Erro:", error.message);
    process.exitCode = 1;
  });
}