import { JF_SPREADSHEET_ID } from '../_utils/jfSheetsConfig.js';
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { abrirBrowser } from "../../../services/puppeteerPool.js";
import { extractBomClimaData } from "./extractor.js";
import { enrichImoveisWithInternalData } from "./extractor-00-rotaInterna.js";
import { consolidateData } from "./parser.js";
import { exportToSheets } from "./sheets.js";
import { contarAntesDaLocacaoAcervo } from "../_utils/locacaoContagem.js";
import { sincronizarLocacao, enriquecerLocacao } from "../_utils/locacaoSincronizacao.js";

export const linksBuscaLocacao = ["https://www.bomclimaimoveisjf.com.br/imoveis/para-alugar/brasil?order=mais_relevantes"];
export const opcoesLocacao = { negociacao: "locacao", incluirTaxas: true };
export const destinoSheetsLocacao = { spreadsheetId: JF_SPREADSHEET_ID, sheetName: "jfBomClima" };
export const outputPathLocacao = fileURLToPath(new URL("../../../../crawler/jfBomClimaLocacao.json", import.meta.url));

export async function main() {
  const existing = fs.existsSync(outputPathLocacao) ? JSON.parse(fs.readFileSync(outputPathLocacao, "utf8")) : [];
  const existingMap = new Map(existing.map(item => [item.linkReal, item]));
  let browser;
  let imoveis;
  let totalEsperado;
  try {
    browser = await abrirBrowser();
    totalEsperado = await contarAntesDaLocacaoAcervo(browser, { projeto: destinoSheetsLocacao.sheetName, url: linksBuscaLocacao[0] });
    imoveis = totalEsperado === 0 ? [] : await extractBomClimaData(browser, linksBuscaLocacao, opcoesLocacao);
    if (!imoveis.length && totalEsperado !== 0) throw new Error("Nenhum aluguel extraido. JSON e Sheets anteriores preservados.");
    if (imoveis.some(item => !item.linkReal || (item.preco !== null && !Number.isFinite(item.preco)))) throw new Error("Imovel sem link ou preco valido. Dados anteriores preservados.");
    if (new Set(imoveis.map(item => item.linkReal)).size !== imoveis.length) throw new Error("Cards duplicados. Coleta nao sera publicada.");
    if (imoveis.length) await enriquecerLocacao(browser, imoveis, enrichImoveisWithInternalData, { preservarFotoListagem: true });
  } finally { if (browser) await browser.close(); }
  await sincronizarLocacao({ imoveis, anteriores: existingMap, imobiliaria: destinoSheetsLocacao.sheetName, outputPath: outputPathLocacao, exportToSheets, spreadsheetId: destinoSheetsLocacao.spreadsheetId, totalEsperado, vazioConfirmado: totalEsperado === 0 });
  console.log(`[BomClimaLocacao] Concluido. imoveis salvos: ${imoveis.length}; JSON: ${outputPathLocacao}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error("[BomClimaLocacao]", error.message); process.exitCode = 1; });
}