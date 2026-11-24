import { JF_SPREADSHEET_ID } from '../_utils/jfSheetsConfig.js';
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { abrirBrowser } from "../../../services/puppeteerPool.js";
import { extractStartData } from "./extractor.js";
import { consolidateData } from "./parser.js";
import { exportToSheets } from "./sheets.js";
import { contarAntesDaLocacaoStart } from "../_utils/locacaoContagem.js";
import { sincronizarLocacao } from "../_utils/locacaoSincronizacao.js";

export const opcoesLocacao = { baseUrl: "https://www.startimoveisjf.com.br/imoveis.php?negocio=2&tipo=&cidade2=&dormitorios=&vagas=&faixapreco1=&faixapreco2=&condo=", strict: true, preservarPreco: true };
export const destinoSheetsLocacao = { spreadsheetId: JF_SPREADSHEET_ID, sheetName: "jfStart" };
export const outputPathLocacao = fileURLToPath(new URL("../../../../crawler/jfStartLocacao.json", import.meta.url));

export async function main() {
  const existing = fs.existsSync(outputPathLocacao) ? JSON.parse(fs.readFileSync(outputPathLocacao, "utf8")) : [];
  const existingMap = new Map(existing.map(item => [item.linkReal, item]));
  const codes = new Set(existing.map(item => String(item.codigoBase)));
  const modes = process.env.CRAWLER_HEADLESS === "true" ? [true, false] : [undefined];
  let imoveis;
  let totalEsperado;
  for (const [attempt, headlessOverride] of modes.entries()) {
    let browser;
    try {
      browser = await abrirBrowser({ headlessOverride });
      totalEsperado = await contarAntesDaLocacaoStart(browser, { projeto: destinoSheetsLocacao.sheetName, url: opcoesLocacao.baseUrl });
      imoveis = totalEsperado === 0 ? [] : (await extractStartData(browser, new Set(), { ...opcoesLocacao, totalEsperado })).imoveisRaspados;
      break;
    } catch (error) {
      if (error.code !== "START_BLOCKED" || attempt === modes.length - 1) throw error;
      console.warn("[StartLocacao] Bloqueio em headless. Tentando navegador visivel...");
    } finally { if (browser) await browser.close(); }
  }
  if (!imoveis.length && totalEsperado !== 0) throw new Error("Nenhum aluguel extraido. JSON e Sheets anteriores preservados.");
  if (imoveis.some(item => !item.linkReal || !Number.isFinite(item.preco))) throw new Error("Imovel sem link ou preco valido. Dados anteriores preservados.");
  await sincronizarLocacao({ imoveis, anteriores: existingMap, imobiliaria: destinoSheetsLocacao.sheetName, outputPath: outputPathLocacao, exportToSheets, spreadsheetId: destinoSheetsLocacao.spreadsheetId, totalEsperado, vazioConfirmado: totalEsperado === 0 });
  console.log(`[StartLocacao] Concluido. imoveis salvos: ${imoveis.length}; JSON: ${outputPathLocacao}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error("[StartLocacao]", error.message); process.exitCode = 1; });
}