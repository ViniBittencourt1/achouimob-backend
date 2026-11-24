import { JF_SPREADSHEET_ID } from '../_utils/jfSheetsConfig.js';
import { fileURLToPath, pathToFileURL } from "node:url";
import { abrirBrowser } from "../../../services/puppeteerPool.js";
import { extractMilImoveisData } from "./extractor.js";
import { enrichImoveisWithInternalData } from "./extractor-00-rotaInterna.js";
import { exportToSheets } from "./sheets.js";
import { contarAntesDaLocacaoPadrao } from "../_utils/locacaoContagem.js";
import { sincronizarLocacao, enriquecerLocacao } from "../_utils/locacaoSincronizacao.js";

export const linksBuscaLocacao = [
  "https://1000imoveisjf.com.br/imoveis?order=recentes&negociacao=locacao&codigo=&tipo=&localizacao=&caracteristicas=&preco_min=&preco_max=",
];
export const destinoSheetsLocacao = {
  spreadsheetId: JF_SPREADSHEET_ID,
  sheetName: "jf1000Imoveis",
};
export const outputPathLocacao = fileURLToPath(
  new URL("../../../../crawler/jf1000ImoveisLocacao.json", import.meta.url)
);

export async function main() {
  console.log("[1000ImoveisLocacao] Iniciando raspagem de alugueis...");
  let browser;
  let imoveis;
  let totalEsperado;
  try {
    browser = await abrirBrowser();
    totalEsperado = await contarAntesDaLocacaoPadrao(browser, { projeto: destinoSheetsLocacao.sheetName, url: linksBuscaLocacao[0] });
    imoveis = totalEsperado === 0 ? [] : await extractMilImoveisData(browser, linksBuscaLocacao, {
      negociacao: "locacao",
      totalEsperado,
    });
    if (!imoveis.length && totalEsperado !== 0) {
      throw new Error("Nenhum aluguel extraido. JSON e planilha anteriores foram preservados.");
    }
    imoveis = Array.from(new Map(imoveis.map((item) => [item.linkReal, item])).values());
    if (imoveis.length) await enriquecerLocacao(browser, imoveis, enrichImoveisWithInternalData);
  } finally {
    if (browser) await browser.close();
  }

  await sincronizarLocacao({ imoveis, imobiliaria: destinoSheetsLocacao.sheetName, outputPath: outputPathLocacao, exportToSheets, spreadsheetId: destinoSheetsLocacao.spreadsheetId, totalEsperado, vazioConfirmado: totalEsperado === 0 });
  console.log(`[1000ImoveisLocacao] Concluido. imoveis salvos: ${imoveis.length}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("[1000ImoveisLocacao] Erro:", error.message);
    process.exitCode = 1;
  });
}