import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { abrirBrowser } from "../../../services/puppeteerPool.js";
import { registrarTotalImoveis } from "../_utils/locacaoContagem.js";
import { sincronizarLocacao } from "../_utils/locacaoSincronizacao.js";
import { sincronizarVendas } from "../_utils/vendasSincronizacao.js";
import { exportToSheets, UBA_SPREADSHEET_ID } from "./sheets.js";

export async function runCrawlerUba(project, negociacao, {
  check = false, browserFactory = abrirBrowser, coletar,
  registrar = registrarTotalImoveis, syncVendas = sincronizarVendas, syncLocacao = sincronizarLocacao,
  outputPath = fileURLToPath(new URL(`../../../../crawler/${project.collection}${negociacao === "locacao" ? "Locacao" : ""}.json`, import.meta.url)),
} = {}) {
  if (!["venda", "locacao"].includes(negociacao)) throw new Error("Negociacao Uba invalida.");
  if (typeof coletar !== "function") throw new Error(`[${project.collection}] Extrator Uba obrigatorio.`);
  const previous = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, "utf8")) : [];
  if (!Array.isArray(previous)) throw new Error(`[${project.collection}] JSON anterior invalido; dados preservados.`);
  const anteriores = new Map(previous.map(item => [item.linkReal, item]));
  const browser = await browserFactory({ headlessOverride: true });
  let result;
  try {
    result = await coletar(browser, project, negociacao, {
      anteriores, enriquecer: !check,
      onCount: async total => {
        if (!check) await registrar(project.collection, total, UBA_SPREADSHEET_ID, negociacao === "venda" ? "Vendas" : "Locacao");
      },
    });
  } finally { await browser.close(); }
  if (check) {
    console.log(`[${project.collection}] Validado sem gravacao: ${result.imoveis.length}/${result.totalEsperado} ${negociacao}.`);
    return result;
  }
  const options = {
    imobiliaria: project.collection, outputPath, exportToSheets,
    spreadsheetId: UBA_SPREADSHEET_ID, totalEsperado: result.totalEsperado,
    vazioConfirmado: negociacao === "locacao" && project.permitirLocacaoVaziaConfirmada === true && result.vazioConfirmado === true &&
      result.totalEsperado === 0 && result.imoveis.length === 0,
    preservarOcorrencias: project.preservarOcorrencias === true,
  };
  if (negociacao === "venda") await syncVendas({ ...options, imoveisRaspados: result.imoveis, consolidados: result.imoveis });
  else await syncLocacao({ ...options, imoveis: result.imoveis, anteriores });
  console.log(`[${project.collection}] ${negociacao} concluida. imoveis salvos: ${result.imoveis.length}`);
  return result;
}
