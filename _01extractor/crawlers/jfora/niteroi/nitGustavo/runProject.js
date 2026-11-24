import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { abrirBrowser } from "../../../../services/puppeteerPool.js";
import { contarAntesDasVendas } from "../../_utils/vendasContagem.js";
import { sincronizarVendas } from "../../_utils/vendasSincronizacao.js";
import { consolidateData } from "../parser.js";
import { exportToSheets } from "../sheets.js";
import { NITEROI_SPREADSHEET_ID } from "../projects.js";
import { project } from "./config.js";
import { extractGustavoSales } from "./extractor.js";

export async function runGustavo({
  checkCompleto = process.argv.includes("--check-completo"),
  check = process.argv.includes("--check") || checkCompleto,
} = {}) {
  const outputPath = fileURLToPath(new URL(`../../../../../crawler/${project.collection}.json`, import.meta.url));
  const previous = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, "utf8")) : [];
  if (!Array.isArray(previous)) throw new Error("[nitGustavo] JSON anterior invalido.");
  console.log("[nitGustavo] Iniciando em segundo plano, sem janela. Consultando total de vendas...");
  const browser = await abrirBrowser({ headlessOverride: true });
  let coleta;
  let totalEsperado;
  try {
    totalEsperado = await contarAntesDasVendas(browser, {
      projeto: project.collection, spreadsheetId: NITEROI_SPREADSHEET_ID, salvar: !check,
    });
    coleta = await extractGustavoSales(browser, { totalEsperado, somentePrimeiraPagina: check && !checkCompleto });
  } finally { await browser.close(); }
  if (check) {
    console.log(`[nitGustavo] CHECK: ${coleta.imoveis.length} vendas; excluidos: ${coleta.excluidosLocacao.length} somente locacao, ${coleta.excluidosVendidos.length} vendidos; total anunciado ${totalEsperado}. Nenhum dado salvo ou publicado.`);
    return coleta;
  }
  const records = coleta.imoveis;
  const totalVendas = totalEsperado - coleta.excluidosLocacao.length - coleta.excluidosVendidos.length;
  if (records.length !== totalVendas) throw new Error("[nitGustavo] Coleta incompleta apos excluir locacao e vendidos; base preservada.");
  console.log(`[nitGustavo] Coleta completa. Consolidando e salvando ${records.length} imoveis...`);
  const result = await sincronizarVendas({
    imoveisRaspados: records, consolidados: consolidateData(records, new Map(previous.map(item => [item.linkReal, item]))),
    imobiliaria: project.collection, outputPath, totalEsperado: totalVendas, vazioConfirmado: totalVendas === 0,
    codigoRepetidoPorLink: true, spreadsheetId: NITEROI_SPREADSHEET_ID, exportToSheets,
  });
  console.log("[nitGustavo] Concluido.");
  return result;
}
