import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { abrirBrowser } from "../../../../services/puppeteerPool.js";
import { contarAntesDasVendas } from "../../_utils/vendasContagem.js";
import { sincronizarVendas } from "../../_utils/vendasSincronizacao.js";
import { consolidateData } from "../parser.js";
import { exportToSheets } from "../sheets.js";
import { NITEROI_SPREADSHEET_ID } from "../projects.js";
import { project } from "./config.js";
import { extractSicilianoSales } from "./extractor.js";

export async function runSiciliano({
  checkCompleto = process.argv.includes("--check-completo"),
  check = process.argv.includes("--check") || checkCompleto,
} = {}) {
  const outputPath = fileURLToPath(new URL(`../../../../../crawler/${project.collection}.json`, import.meta.url));
  const previous = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, "utf8")) : [];
  if (!Array.isArray(previous)) throw new Error("[nitSiciliano] JSON anterior invalido.");
  console.log("[nitSiciliano] Iniciando em segundo plano, sem janela. Consultando total de vendas...");
  const browser = await abrirBrowser({ headlessOverride: true });
  let records;
  let totalEsperado;
  try {
    totalEsperado = await contarAntesDasVendas(browser, {
      projeto: project.collection, spreadsheetId: NITEROI_SPREADSHEET_ID, salvar: !check,
    });
    records = await extractSicilianoSales(browser, { totalEsperado, somentePrimeiraPagina: check && !checkCompleto });
  } finally { await browser.close(); }
  if (check) {
    console.log(`[nitSiciliano] CHECK: ${records.length}/${totalEsperado} imoveis validados; nenhum dado salvo ou publicado.`);
    return records;
  }
  console.log(`[nitSiciliano] Coleta completa. Consolidando e salvando ${records.length} imoveis...`);
  const result = await sincronizarVendas({
    imoveisRaspados: records, consolidados: consolidateData(records, new Map(previous.map(item => [item.linkReal, item]))),
    imobiliaria: project.collection, outputPath, totalEsperado, vazioConfirmado: totalEsperado === 0,
    codigoRepetidoPorLink: true, spreadsheetId: NITEROI_SPREADSHEET_ID, exportToSheets,
  });
  console.log("[nitSiciliano] Concluido.");
  return result;
}
