import { contarAntesDasVendas } from "../_utils/vendasContagem.js";
import { sincronizarVendas } from "../_utils/vendasSincronizacao.js";
import { getCollectionAsMap } from "../../../services/crawlerJson.js";
import { abrirBrowser } from "../../../services/puppeteerPool.js";
import { extractHolderData } from "./extractor.js";
import * as parser from "./parser.js";
import * as sheetsModule from "./sheets.js";

const COLLECTION_NAME = "jfHolder";
const KEY_FIELD = "linkReal";

async function main() {
  let totalDisponivelVendas;
  console.log("🚀 Iniciando orquestrador do crawler Holder...");
  let browser;

  try {
    browser = await abrirBrowser();
    totalDisponivelVendas = await contarAntesDasVendas(browser, { projeto: COLLECTION_NAME });
    const existingDataMap = await getCollectionAsMap(COLLECTION_NAME, KEY_FIELD);
    console.log(`🔥 ${existingDataMap.size} registros existentes carregados.`);

    const existingCodigoBaseSet = new Set(Array.from(existingDataMap.values()).map(item => String(item.codigoBase)));
    const { imoveisRaspados, novosImoveis } = await extractHolderData(browser, existingCodigoBaseSet);
    console.log(`✅ ${imoveisRaspados.length} imóveis raspados da listagem.`);
    console.log(`🆕 ${novosImoveis.length} imóveis novos.`);
    console.log(`imóveis salvos: ${imoveisRaspados.length}`);

    const dataConsolidada = parser.consolidateData(imoveisRaspados, existingDataMap);
    console.log(`📊 ${dataConsolidada.size} registros consolidados após a lógica de negócio.`);

    await sincronizarVendas({
      totalEsperado: totalDisponivelVendas,
      vazioConfirmado: totalDisponivelVendas === 0,
      imoveisRaspados: imoveisRaspados,
      consolidados: dataConsolidada,
      imobiliaria: COLLECTION_NAME,
      exportToSheets: sheetsModule.exportToSheets,
    });

    console.log("\n🏁 Processo do crawler Holder finalizado com sucesso!");
  } catch (error) {
    console.error("\n❌ Erro fatal no orquestrador:", error);
    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close();
      console.log("🚪 Navegador fechado.");
    }
  }
}

main();
