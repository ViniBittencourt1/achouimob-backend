import { backendRoot as ISOLATED_BACKEND_ROOT } from '../../../../backend-paths.cjs';
import { contarAntesDasVendas } from "../_utils/vendasContagem.js";
import { sincronizarVendas } from "../_utils/vendasSincronizacao.js";
import { getCollectionAsMap } from "../../../services/crawlerJson.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import { abrirBrowser } from "../../../services/puppeteerPool.js";
import { extractStartData } from "./extractor.js";
import * as parser from "./parser.js";
import * as sheetsModule from "./sheets.js";

// 🔽 IMPORT DO ATUALIZADOR DE BAIRROS
// import { listarBairrosMaiusculos } from "../_check/jfBairros.js";

// 🔽 IMPORT DO EXTRACTOR DO CARD 1
// import { extractCard1 } from "../../_cards/extractorCard1.js";

const COLLECTION_NAME = "jfStart";
const KEY_FIELD = "linkReal";

async function main() {
  let totalDisponivelVendas;
  console.log("🚀 Iniciando orquestrador do crawler Start...");
  let browser;

  // 🔽 CORREÇÃO DA ROTA DE SALVAMENTO
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // Caminho absoluto direto para backend/crawler/jfStart.json
  const jfStartPath = path.resolve(ISOLATED_BACKEND_ROOT, "crawler", "jfStart.json");
  const outputDir = path.dirname(jfStartPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`📁 Diretório de saída '${outputDir}' garantido.`);
  }

  try {

    let existingDataMap;
    let existingCodigoBaseSet;
    let imoveisRaspados = [];
    let novosImoveis = [];

    const deveTentarFallbackNaoHeadless = process.env.CRAWLER_HEADLESS === "true";
    const modosHeadlessTentativa = deveTentarFallbackNaoHeadless ? [true, false] : [undefined];

    for (let tentativa = 0; tentativa < modosHeadlessTentativa.length; tentativa++) {
      const headlessOverride = modosHeadlessTentativa[tentativa];
      const descricaoModo = typeof headlessOverride === "boolean"
        ? `headless=${headlessOverride}`
        : "headless do .env";

      try {
        console.log(`[Start] Tentativa ${tentativa + 1}/${modosHeadlessTentativa.length} em modo ${descricaoModo}.`);
        browser = await abrirBrowser({ headlessOverride });
        totalDisponivelVendas = await contarAntesDasVendas(browser, { projeto: COLLECTION_NAME });
        existingDataMap = await getCollectionAsMap(COLLECTION_NAME, KEY_FIELD);
        console.log(`🔥 ${existingDataMap.size} registros existentes carregados.`);

        existingCodigoBaseSet = new Set(Array.from(existingDataMap.values()).map(item => String(item.codigoBase)));
        const extraidos = await extractStartData(browser, existingCodigoBaseSet);
        imoveisRaspados = extraidos.imoveisRaspados;
        novosImoveis = extraidos.novosImoveis;

        const executandoHeadlessSemFallback = headlessOverride !== false && tentativa < modosHeadlessTentativa.length - 1;
        if (imoveisRaspados.length === 0 && executandoHeadlessSemFallback) {
          console.warn("[Start] 0 imóveis em modo headless. Tentando novamente em modo não-headless...");
          continue;
        }

        break;
      } catch (err) {
        const bloqueado = err?.code === "START_BLOCKED";
        const podeTentarFallback = tentativa < modosHeadlessTentativa.length - 1;

        if (bloqueado && podeTentarFallback) {
          console.warn("[Start] Bloqueio detectado em headless. Retentando em modo não-headless...");
          continue;
        }

        throw err;
      } finally {
        if (browser) {
          await browser.close();
          browser = null;
          console.log("🚪 Navegador fechado.");
        }
      }
    }

    console.log(`✅ ${imoveisRaspados.length} imóveis raspados da listagem.`);
    console.log(`🆕 ${novosImoveis.length} imóveis novos para raspagem detalhada.`);

    if (imoveisRaspados.length === 0 && existingDataMap.size > 0) {
      throw new Error("[Start] Nenhum imóvel raspado, abortando atualização para evitar exclusão em massa por bloqueio/scraping inválido.");
    }

    const dataConsolidada = parser.consolidateData(imoveisRaspados, existingDataMap);
    console.log(`📊 ${dataConsolidada.size} registros consolidados após a lógica de negócio.`);

    // await batchUpdateFromMap(COLLECTION_NAME, dataConsolidada); // REMOVIDO: atualização de cards não permitida



    // 🔽 SALVAMENTO DO ARQUIVO JSON NA ROTA CORRIGIDA
    try {


    } catch (err) {
      console.error("❌ Erro ao salvar jfStart.json:", err);
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

    console.log("\n🏁 Processo do crawler Start finalizado com sucesso!");

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