import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { abrirBrowser } from "../../../../services/puppeteerPool.js";
import { contarAntesDasVendas } from "../../_utils/vendasContagem.js";
import { sincronizarVendas } from "../../_utils/vendasSincronizacao.js";
import { consolidateData } from "../parser.js";
import { exportToSheets } from "../sheets.js";
import { NITEROI_SPREADSHEET_ID } from "../projects.js";
import { getProjetoNiteroiImobBrasil } from "./projects.js";
import { extractImobBrasilSales, enriquecerNovosImobBrasil, IMOBBRASIL_USER_AGENT } from "./extractor.js";

export async function runNiteroiImobBrasil(name, { check = process.argv.includes("--check") } = {}) {
  const project = getProjetoNiteroiImobBrasil(name);
  const outputPath = fileURLToPath(new URL(`../../../../../crawler/${project.collection}.json`, import.meta.url));
  const previous = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, "utf8")) : [];
  if (!Array.isArray(previous)) throw new Error(`[${name}] JSON anterior invalido.`);
  const previousMap = new Map(previous.map(record => [record.linkReal, record]));
  let records;
  let totalEsperado;
  const somenteHeadless = project.collection === "nitNiteroi";
  console.log(`[${name}] Iniciando raspagem${somenteHeadless ? " em segundo plano, sem janela de navegador" : ""}.`);
  for (const headlessOverride of somenteHeadless ? [true] : [true, false]) {
    const browser = await abrirBrowser({ headlessOverride, foraDaTela: true });
    try {
      console.log(`[${name}] Consultando total de vendas...`);
      totalEsperado = await contarAntesDasVendas(browser, { projeto: name, spreadsheetId: NITEROI_SPREADSHEET_ID, salvar: !check,
        ...((somenteHeadless || project.collection === "nitOceanica") ? { userAgent: IMOBBRASIL_USER_AGENT } : {}),
      });
      records = await extractImobBrasilSales(browser, project, { totalEsperado, somentePrimeiraPagina: check });
      if (check) {
        console.log(`[${name}] CHECK: ${totalEsperado} vendas; ${records.length} cards validados. Nenhum JSON, Sheets ou servico de publicacao alterado.`);
        return records;
      }
      await enriquecerNovosImobBrasil(browser, records, previousMap, { projectName: name });
      break;
    } catch (error) {
      if (somenteHeadless || !headlessOverride || !error.code?.endsWith("_BLOCKED")) throw error;
      console.warn(`[${name}] Site bloqueou headless; usando navegador em segundo plano, fora da tela.`);
    } finally { await browser.close(); }
  }
  console.log(`[${name}] Coleta e detalhes concluidos. Iniciando consolidacao e salvamento de ${records.length} imoveis...`);
  return sincronizarVendas({
    imoveisRaspados: records, consolidados: consolidateData(records, previousMap),
    imobiliaria: name, outputPath, totalEsperado, vazioConfirmado: totalEsperado === 0,
    codigoRepetidoPorLink: true, spreadsheetId: NITEROI_SPREADSHEET_ID, exportToSheets,
  });
}
