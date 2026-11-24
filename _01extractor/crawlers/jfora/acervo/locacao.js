import { JF_SPREADSHEET_ID } from '../_utils/jfSheetsConfig.js';
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { abrirBrowser } from "../../../services/puppeteerPool.js";
import { extractAcervoData } from "./extractor.js";
import { enrichImoveisWithInternalData } from "./extractor-00-rotaInterna.js";
import { consolidateData } from "./parser.js";
import { exportToSheets } from "./sheets.js";
import { contarAntesDaLocacaoAcervo } from "../_utils/locacaoContagem.js";
import { sincronizarLocacao, enriquecerLocacao } from "../_utils/locacaoSincronizacao.js";

export const linksBuscaLocacao = [
  "https://www.acervoimoveis.com.br/imoveis/para-alugar/brasil?order=mais_relevantes",
];
export const opcoesLocacao = { negociacao: "locacao", incluirTaxas: true };
export const destinoSheetsLocacao = {
  spreadsheetId: JF_SPREADSHEET_ID,
  sheetName: "jfAcervo",
};
export const outputPathLocacao = fileURLToPath(
  new URL("../../../../crawler/jfAcervoLocacao.json", import.meta.url)
);

export async function main() {
  console.log("[AcervoLocacao] Iniciando raspagem de alugueis...");
  const existingData = fs.existsSync(outputPathLocacao)
    ? JSON.parse(fs.readFileSync(outputPathLocacao, "utf-8"))
    : [];
  const existingDataMap = new Map(existingData.map((item) => [item.linkReal, item]));
  let browser;
  let imoveis;
  let totalEsperado;
  try {
    browser = await abrirBrowser();
    totalEsperado = await contarAntesDaLocacaoAcervo(browser, { projeto: destinoSheetsLocacao.sheetName, url: linksBuscaLocacao[0] });
    imoveis = totalEsperado === 0 ? [] : await extractAcervoData(browser, linksBuscaLocacao, opcoesLocacao);
    if (!imoveis.length && totalEsperado !== 0) {
      throw new Error("Nenhum aluguel extraido. JSON e planilha anteriores foram preservados.");
    }
    if (imoveis.some((item) => !item.linkReal || typeof item.preco !== "number")) {
      throw new Error("Aluguel sem link ou preco valido. JSON e planilha anteriores foram preservados.");
    }
    if (imoveis.length) await enriquecerLocacao(browser, imoveis, enrichImoveisWithInternalData);
  } finally {
    if (browser) await browser.close();
  }

  await sincronizarLocacao({ imoveis, anteriores: existingDataMap, imobiliaria: destinoSheetsLocacao.sheetName, outputPath: outputPathLocacao, exportToSheets, spreadsheetId: destinoSheetsLocacao.spreadsheetId, totalEsperado, vazioConfirmado: totalEsperado === 0 });
  console.log(`[AcervoLocacao] Concluido. imoveis salvos: ${imoveis.length}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("[AcervoLocacao] Erro:", error.message);
    process.exitCode = 1;
  });
}