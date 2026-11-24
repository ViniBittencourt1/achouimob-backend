import { JF_SPREADSHEET_ID } from '../_utils/jfSheetsConfig.js';
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { abrirBrowser } from "../../../services/puppeteerPool.js";
import { extractSouzaGomesData } from "./extractor.js";
import { enrichImoveisWithInternalData } from "./extractor-00-rotaInterna.js";
import { consolidateData } from "./parser.js";
import { exportToSheets } from "./sheets.js";
import { contarAntesDaLocacaoPadrao } from "../_utils/locacaoContagem.js";
import { sincronizarLocacao, enriquecerLocacao } from "../_utils/locacaoSincronizacao.js";

export const linksBuscaLocacao = [
  "https://souzagomes.com.br/imoveis?order=recentes&codigo=&negociacao=locacao&tipo=&localizacao=&preco_min=&preco_max=&caracteristicas=",
];
export const destinoSheetsLocacao = {
  spreadsheetId: JF_SPREADSHEET_ID,
  sheetName: "jfSouzaGomes",
};
export const outputPathLocacao = fileURLToPath(
  new URL("../../../../crawler/jfSouzaGomesLocacao.json", import.meta.url)
);

export async function main() {
  console.log("[SouzaGomesLocacao] Iniciando raspagem de alugueis...");
  const existingData = fs.existsSync(outputPathLocacao)
    ? JSON.parse(fs.readFileSync(outputPathLocacao, "utf-8"))
    : [];
  const existingDataMap = new Map(existingData.map(item => [item.linkReal, item]));
  let browser;
  let imoveis;
  let totalEsperado;
  try {
    browser = await abrirBrowser();
    totalEsperado = await contarAntesDaLocacaoPadrao(browser, { projeto: destinoSheetsLocacao.sheetName, url: linksBuscaLocacao[0] });
    const result = totalEsperado === 0 ? { imoveisRaspados: [] } : await extractSouzaGomesData(browser, { linksBusca: linksBuscaLocacao, negociacao: "locacao" });
    imoveis = result.imoveisRaspados;
    if (!imoveis.length && totalEsperado !== 0) throw new Error("Nenhum aluguel extraido. JSON e planilha anteriores preservados.");
    if (imoveis.some(item => !item.linkReal || (item.preco !== null && !Number.isFinite(item.preco)))) {
      throw new Error("Aluguel sem link ou preco valido. Dados anteriores preservados.");
    }
    imoveis = Array.from(new Map(imoveis.map(item => [item.linkReal, item])).values());
    if (imoveis.length) await enriquecerLocacao(browser, imoveis, enrichImoveisWithInternalData);
  } finally {
    if (browser) await browser.close();
  }

  await sincronizarLocacao({ imoveis, anteriores: existingDataMap, imobiliaria: destinoSheetsLocacao.sheetName, outputPath: outputPathLocacao, exportToSheets, spreadsheetId: destinoSheetsLocacao.spreadsheetId, totalEsperado, vazioConfirmado: totalEsperado === 0 });
  console.log(`[SouzaGomesLocacao] Concluido. imoveis salvos: ${imoveis.length}; JSON: ${outputPathLocacao}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error("[SouzaGomesLocacao] Erro:", error.message);
    process.exitCode = 1;
  });
}