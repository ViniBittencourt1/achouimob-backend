import { JF_SPREADSHEET_ID } from '../_utils/jfSheetsConfig.js';
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { abrirBrowser } from "../../../services/puppeteerPool.js";
import { extractFogelData } from "./extractor.js";
import { consolidateData } from "./parser.js";
import { exportToSheets } from "./sheets.js";
import { contarAntesDaLocacaoColibex } from "../_utils/locacaoContagem.js";
import { sincronizarLocacao } from "../_utils/locacaoSincronizacao.js";

export const opcoesLocacao = { baseUrl: "https://fogel.com.br/pesquisa?transacao=Loca%C3%A7%C3%A3o&ordena=menor_valor", incluirTaxas: true, preservarPreco: true, strict: true };
export const destinoSheetsLocacao = { spreadsheetId: JF_SPREADSHEET_ID, sheetName: "jfFogel" };
export const outputPathLocacao = fileURLToPath(new URL("../../../../crawler/jfFogelLocacao.json", import.meta.url));

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
      totalEsperado = await contarAntesDaLocacaoColibex(browser, { projeto: destinoSheetsLocacao.sheetName, url: opcoesLocacao.baseUrl });
      if (totalEsperado === 0) { imoveis = []; break; }
      const result = await extractFogelData(browser, new Set(), opcoesLocacao);
      imoveis = result.imoveisRaspados;
      break;
    } catch (error) {
      if (error.code !== "FOGEL_BLOCKED" || attempt === modes.length - 1) throw error;
      console.warn("[FogelLocacao] Bloqueio em headless. Tentando navegador visivel...");
    } finally { if (browser) await browser.close(); }
  }
  if (!imoveis.length && totalEsperado !== 0) throw new Error("Nenhum aluguel extraido. JSON e Sheets anteriores preservados.");
  if (imoveis.some(item => !item.linkReal || !Number.isFinite(item.preco))) throw new Error("Imovel sem link ou preco valido. Dados anteriores preservados.");
  await sincronizarLocacao({ imoveis, anteriores: existingMap, imobiliaria: destinoSheetsLocacao.sheetName, outputPath: outputPathLocacao, exportToSheets, spreadsheetId: destinoSheetsLocacao.spreadsheetId, totalEsperado, vazioConfirmado: totalEsperado === 0 });
  console.log(`[FogelLocacao] Concluido. imoveis salvos: ${imoveis.length}; JSON: ${outputPathLocacao}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error("[FogelLocacao]", error.message); process.exitCode = 1; });
}