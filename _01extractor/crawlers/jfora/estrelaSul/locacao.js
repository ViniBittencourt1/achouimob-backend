import { JF_SPREADSHEET_ID } from '../_utils/jfSheetsConfig.js';
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { abrirBrowser } from "../../../services/puppeteerPool.js";
import { extractEstrelaSulData } from "./extractor.js";
import { consolidateData } from "./parser.js";
import { exportToSheets } from "./sheets.js";
import { contarAntesDaLocacaoKenlo } from "../_utils/locacaoContagem.js";
import { sincronizarLocacao } from "../_utils/locacaoSincronizacao.js";

export const linksBuscaLocacao = ["https://www.estrelasulimoveis.com.br/imoveis/para-alugar"];
export const destinoSheetsLocacao = { spreadsheetId: JF_SPREADSHEET_ID, sheetName: "jfEstrelaSul" };
export const outputPathLocacao = fileURLToPath(new URL("../../../../crawler/jfEstrelaSulLocacao.json", import.meta.url));

export async function main() {
  const existing = fs.existsSync(outputPathLocacao) ? JSON.parse(fs.readFileSync(outputPathLocacao, "utf8")) : [];
  const existingMap = new Map(existing.map(item => [item.linkReal, item]));
  let browser;
  let imoveis;
  let totalEsperado;
  try {
    browser = await abrirBrowser();
    totalEsperado = await contarAntesDaLocacaoKenlo(browser, { projeto: destinoSheetsLocacao.sheetName, url: linksBuscaLocacao[0] });
    imoveis = totalEsperado === 0 ? [] : await extractEstrelaSulData(browser, linksBuscaLocacao, { negociacao: "locacao" });
    if (!imoveis.length && totalEsperado !== 0) throw new Error("Nenhum aluguel extraido. JSON e Sheets anteriores preservados.");
    if (imoveis.some(item => !item.linkReal || (item.preco !== null && !Number.isFinite(item.preco)))) {
      throw new Error("Aluguel sem link ou preco valido. Dados anteriores preservados.");
    }
    const unique = new Map(imoveis.map(item => [item.linkReal, item]));
    if (unique.size !== imoveis.length) throw new Error("Cards duplicados na listagem. Coleta nao sera publicada.");
  } finally { if (browser) await browser.close(); }
  await sincronizarLocacao({ imoveis, anteriores: existingMap, imobiliaria: destinoSheetsLocacao.sheetName, outputPath: outputPathLocacao, exportToSheets, spreadsheetId: destinoSheetsLocacao.spreadsheetId, totalEsperado, vazioConfirmado: totalEsperado === 0 });
  console.log(`[EstrelaSulLocacao] Concluido. imoveis salvos: ${imoveis.length}; JSON: ${outputPathLocacao}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error("[EstrelaSulLocacao]", error.message);
    process.exitCode = 1;
  });
}