import { backendRoot as ISOLATED_BACKEND_ROOT } from '../../../../backend-paths.cjs';
import { contarAntesDasVendas } from "../_utils/vendasContagem.js";
import { sincronizarVendas } from "../_utils/vendasSincronizacao.js";
import { getCollectionAsMap } from "../../../services/crawlerJson.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import { abrirBrowser } from "../../../services/puppeteerPool.js";
import { extractPositivoData, USER_AGENT_POSITIVO } from "./extractor.js";
import * as parser from "./parser.js";
import * as sheetsModule from "./sheets.js";

// 🔽 IMPORT DO ATUALIZADOR DE BAIRROS
// import { listarBairrosMaiusculos } from "../_check/jfBairros.js";

// 🔽 IMPORT DO EXTRACTOR DO CARD 1
// import { extractCard1 } from "../../_cards/extractorCard1.js";

const COLLECTION_NAME = "jfPositivo";
const KEY_FIELD = "linkReal";

async function main() {
  let totalDisponivelVendas;
  console.log("🚀 Iniciando orquestrador do crawler Positivo...");
  let browser;

  // 🔽 CORREÇÃO DA ROTA DE SALVAMENTO
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // Caminho absoluto direto para backend/crawler/jfPositivo.json
  const jfPositivoPath = path.resolve(ISOLATED_BACKEND_ROOT, "crawler", "jfPositivo.json");
  const outputDir = path.dirname(jfPositivoPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`📁 Diretório de saída '${outputDir}' garantido.`);
  }

  try {

    let existingDataMap;
    let existingCodigoBaseSet;
    let imoveisRaspados = [];
    let novosImoveis = [];

    console.log("[Positivo] Iniciando raspagem em modo headless.");
    try {
      browser = await abrirBrowser({ headlessOverride: true });
      totalDisponivelVendas = await contarAntesDasVendas(browser, { projeto: COLLECTION_NAME, userAgent: USER_AGENT_POSITIVO });
      existingDataMap = await getCollectionAsMap(COLLECTION_NAME, KEY_FIELD);
      console.log(`🔥 ${existingDataMap.size} registros existentes carregados.`);

      existingCodigoBaseSet = new Set(Array.from(existingDataMap.values()).map(item => String(item.codigoBase)));
      const extraidos = await extractPositivoData(browser, existingCodigoBaseSet);
      imoveisRaspados = extraidos.imoveisRaspados;
      novosImoveis = extraidos.novosImoveis;
    } finally {
      if (browser) {
        await browser.close();
        browser = null;
        console.log("🚪 Navegador fechado.");
      }
    }

    console.log(`✅ ${imoveisRaspados.length} imóveis raspados da listagem.`);
    console.log(`🆕 ${novosImoveis.length} imóveis novos para raspagem detalhada.`);

    if (imoveisRaspados.length === 0 && existingDataMap.size > 0) {
      throw new Error("[Positivo] Nenhum imóvel raspado, abortando atualização para evitar exclusão em massa por bloqueio/scraping inválido.");
    }

    const dataConsolidada = parser.consolidateData(imoveisRaspados, existingDataMap);
    console.log(`📊 ${dataConsolidada.size} registros consolidados após a lógica de negócio.`);

    // await batchUpdateFromMap(COLLECTION_NAME, dataConsolidada); // REMOVIDO: atualização de cards não permitida


    // 🔽 SALVAMENTO DO ARQUIVO JSON NA ROTA CORRIGIDA
    try {

    } catch (err) {
      console.error("❌ Erro ao salvar jfPositivo.json:", err);
    }

    const exportToSheets = sheetsModule.exportToSheets || sheetsModule.default;
    if (typeof exportToSheets === 'function') {
      await sincronizarVendas({
        totalEsperado: totalDisponivelVendas,
        vazioConfirmado: totalDisponivelVendas === 0,
        imoveisRaspados: imoveisRaspados,
        consolidados: dataConsolidada,
        imobiliaria: COLLECTION_NAME,
        exportToSheets: exportToSheets,
      });
      // Limpa o Map após exportar
      if (dataConsolidada && typeof dataConsolidada.clear === 'function') dataConsolidada.clear();
    }

    console.log("\n🏁 Processo do crawler Positivo finalizado com sucesso!");

    // Chamada a updateBairros removida pois não está definida

    // 🔽 EXTRAÇÃO DO CARD 1 AO FINAL (removido extractCard1)

  } catch (error) {
    console.error("\n❌ Erro fatal no orquestrador:", error);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
      console.log("🚪 Navegador fechado.");
    }
  }
}

main();