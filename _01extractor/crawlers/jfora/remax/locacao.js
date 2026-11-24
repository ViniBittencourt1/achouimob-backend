import { JF_SPREADSHEET_ID } from '../_utils/jfSheetsConfig.js';
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { abrirBrowser } from "../../../services/puppeteerPool.js";
import { extractRemaxData } from "./extractor.js";
import { consolidateData } from "./parser.js";
import { exportToSheets } from "./sheets.js";
import { contarAntesDaLocacaoRemax } from "../_utils/locacaoContagem.js";
import { sincronizarLocacao } from "../_utils/locacaoSincronizacao.js";

export const opcoesLocacao = { baseUrl: "https://www.remax.com.br/listings?Country=Brasil&Province=9512&City=6579324&CountryId=55&CityNM=6579324-Juiz+de+Fora%2C+Minas+Gerais&ProvinceNM=9512-Minas+Gerais%2C+Regi%C3%A3o+Sudeste&ListingClass=-1&TransactionTypeUID=260", negociacao: "locacao" };
export const destinoSheetsLocacao = { spreadsheetId: JF_SPREADSHEET_ID, sheetName: "jfRemax" };
export const outputPathLocacao = fileURLToPath(new URL("../../../../crawler/jfRemaxLocacao.json", import.meta.url));

export async function main() {
  const existing = fs.existsSync(outputPathLocacao) ? JSON.parse(fs.readFileSync(outputPathLocacao, "utf8")) : [];
  const existingMap = new Map(existing.map(item => [item.linkReal, item]));
  let browser;
  let imoveis;
  let totalEsperado;
  try {
    browser = await abrirBrowser();
    totalEsperado = await contarAntesDaLocacaoRemax(browser, { projeto: destinoSheetsLocacao.sheetName, url: opcoesLocacao.baseUrl });
    imoveis = totalEsperado === 0 ? [] : (await extractRemaxData(browser, { ...opcoesLocacao, totalEsperado, existingDataMap: existingMap })).imoveisRaspados;
    if (!imoveis.length && totalEsperado !== 0) throw new Error("Nenhum aluguel extraido. Dados anteriores preservados.");
    if (imoveis.some(item => !item.linkReal || (item.preco !== null && !Number.isFinite(item.preco)))) throw new Error("Imovel sem link ou preco valido. Dados anteriores preservados.");
  } finally { if (browser) await browser.close(); }
  await sincronizarLocacao({ imoveis, anteriores: existingMap, imobiliaria: destinoSheetsLocacao.sheetName, outputPath: outputPathLocacao, exportToSheets, spreadsheetId: destinoSheetsLocacao.spreadsheetId, totalEsperado, vazioConfirmado: totalEsperado === 0 });
  console.log(`[RemaxLocacao] Concluido. imoveis salvos: ${imoveis.length}; JSON: ${outputPathLocacao}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error("[RemaxLocacao]", error.message); process.exitCode = 1; });
}