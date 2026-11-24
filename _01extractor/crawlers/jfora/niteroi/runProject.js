import { contarAntesDasVendas } from "../_utils/vendasContagem.js";
import { sincronizarVendas } from "../_utils/vendasSincronizacao.js";
import { getCollectionAsMap } from "../../../services/crawlerJson.js";
import { abrirBrowser } from "../../../services/puppeteerPool.js";
import { extractNiteroiSales } from "./extractor.js";
import { NITEROI_SPREADSHEET_ID } from "./projects.js";
import * as parser from "./parser.js";
import * as sheetsModule from "./sheets.js";

export async function runNiteroiProject({ projectName, displayName, baseUrl }) {
  const KEY_FIELD = "linkReal";
  let totalDisponivelVendas;
  let browser;
  let imoveisRaspados;
  let dataConsolidada;

  try {
    console.log(`🚀 Iniciando crawler ${displayName} (${projectName})...`);
    browser = await abrirBrowser({
      // O DNS público do Kiffer aponta para uma hospedagem antiga; o site permanece ativo na Kenlo.
      hostResolverRules: projectName === "nitKiffer"
        ? "MAP www.kifferimoveis.com.br 170.82.174.30"
        : undefined,
    });
    const existingDataMap = await getCollectionAsMap(projectName, KEY_FIELD);
    const conferirEstabilidade = ["nitNova", "nitAmin", "nitTeto", "nitFlora", "nitPredial"].includes(projectName);
    const maxTentativas = conferirEstabilidade ? 3 : 1;
    for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
      try {
        totalDisponivelVendas = await contarAntesDasVendas(browser, {
          projeto: projectName,
          // Sites protegidos por WAF (ex.: GoCache da Nova) devolvem 429 temporario quando o limite de acessos e atingido.
          esperasBloqueioMs: [60000, 120000, 240000],
        });
        const coletados = await extractNiteroiSales(browser, {
          projectName,
          displayName,
          baseUrl,
          totalEsperado: totalDisponivelVendas,
        });
        if (conferirEstabilidade) {
          const totalFinal = await contarAntesDasVendas(browser, {
            projeto: projectName,
            salvar: false,
            esperasBloqueioMs: [60000, 120000, 240000],
          });
          if (totalFinal !== totalDisponivelVendas) {
            const error = new Error(`[${projectName}] Total mudou entre o inicio e o fim: ${totalDisponivelVendas} -> ${totalFinal}; base preservada.`);
            error.code = "KENLO_TOTAL_ALTERADO";
            throw error;
          }
        }
        imoveisRaspados = coletados;
        break;
      } catch (error) {
        if (conferirEstabilidade && error.code === "KENLO_TOTAL_DIVERGENTE") {
          const totalAtual = await contarAntesDasVendas(browser, {
            projeto: projectName,
            salvar: false,
            esperasBloqueioMs: [60000, 120000, 240000],
          });
          if (totalAtual !== totalDisponivelVendas) {
            const changed = new Error(`[${projectName}] Total global mudou durante a coleta: ${totalDisponivelVendas} -> ${totalAtual}; base preservada.`, { cause: error });
            changed.code = "KENLO_TOTAL_ALTERADO";
            error = changed;
          }
        }
        if (error.code !== "KENLO_TOTAL_ALTERADO" || tentativa >= maxTentativas) throw error;
        console.warn(`[${projectName}] ${error.message} Descartando coleta parcial e recontando para reiniciar do zero (tentativa ${tentativa + 1}/${maxTentativas}).`);
      }
    }

    if (imoveisRaspados.length === 0 && existingDataMap.size > 0) {
      throw new Error(`[${projectName}] Nenhum imóvel raspado. Abortando para evitar exclusão em massa.`);
    }

    dataConsolidada = parser.consolidateData(imoveisRaspados, existingDataMap);
    console.log(`✅ ${imoveisRaspados.length} imóveis raspados para ${displayName}.`);
  } finally {
    if (browser) await browser.close();
  }

  await sincronizarVendas({
    totalEsperado: totalDisponivelVendas,
    vazioConfirmado: totalDisponivelVendas === 0,
    imoveisRaspados,
    consolidados: dataConsolidada,
    imobiliaria: projectName,
    spreadsheetId: NITEROI_SPREADSHEET_ID,
    exportToSheets: sheetsModule.exportToSheets,
  });
  console.log(`\n🏁 Processo do crawler ${displayName} finalizado com sucesso!`);
}
