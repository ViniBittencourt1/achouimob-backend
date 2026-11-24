import { backendRoot as ISOLATED_BACKEND_ROOT } from '../../../../backend-paths.cjs';
import { contarAntesDasVendas } from "../_utils/vendasContagem.js";
import { sincronizarVendas } from "../_utils/vendasSincronizacao.js";
import { getCollectionAsMap } from "../../../services/crawlerJson.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import { abrirBrowser } from "../../../services/puppeteerPool.js";
import { extractRVNegociosData, USER_AGENT_RVNEGOCIOS } from "./extractor.js";
import * as parser from "./parser.js";
import * as sheetsModule from "./sheets.js";

// 🔽 IMPORT DO ATUALIZADOR DE BAIRROS


// 🔽 IMPORT DO EXTRACTOR DO CARD 1
import { extractCard1 } from "../../_cards/extractorCard1.js";

const COLLECTION_NAME = "jfRVNegocios";
const KEY_FIELD = "linkReal";

async function main() {
  let totalDisponivelVendas;
  console.log("🚀 Iniciando orquestrador do crawler RV Negócios...");
  let browser;

  // 🔽 CORREÇÃO DA ROTA DE SALVAMENTO
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // Caminho absoluto direto para backend/crawler/jfRVNegocios.json
  const jfRVNegociosPath = path.resolve(ISOLATED_BACKEND_ROOT, "crawler", "jfRVNegocios.json");
  const outputDir = path.dirname(jfRVNegociosPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`📁 Diretório de saída '${outputDir}' garantido.`);
  }

  try {
    browser = await abrirBrowser({ headlessOverride: true });
    totalDisponivelVendas = await contarAntesDasVendas(browser, { projeto: COLLECTION_NAME, userAgent: USER_AGENT_RVNEGOCIOS });
    const existingDataMap = await getCollectionAsMap(COLLECTION_NAME, KEY_FIELD);
    console.log(`🔥 ${existingDataMap.size} registros existentes carregados.`);

    const existingCodigoBaseSet = new Set(Array.from(existingDataMap.values()).map(item => String(item.codigoBase)));
    const { imoveisRaspados, novosImoveis } = await extractRVNegociosData(browser, existingCodigoBaseSet, { totalEsperado: totalDisponivelVendas, strict: true });
    console.log(`✅ ${imoveisRaspados.length} imóveis raspados da listagem.`);
    // Adiciona log para o backend capturar corretamente o número de imóveis salvos
    console.log(`imóveis salvos: ${imoveisRaspados.length}`);


    const dataConsolidada = parser.consolidateData(imoveisRaspados, existingDataMap);
    console.log(`📊 ${dataConsolidada.size} registros consolidados após a lógica de negócio.`);

    const dadosParaSaida = Array.from(dataConsolidada.values());



    // Salva os dados consolidados no Firebase


    // Envia os dados para o Google Sheets
    await sincronizarVendas({
        totalEsperado: totalDisponivelVendas,
        vazioConfirmado: totalDisponivelVendas === 0,
      imoveisRaspados: imoveisRaspados,
      consolidados: dataConsolidada,
      imobiliaria: COLLECTION_NAME,
      exportToSheets: sheetsModule.exportToSheets,
    });

    console.log("\n🏁 Processo do crawler RV Negócios finalizado com sucesso!");

  } catch (error) {
    console.error("\n❌ Erro fatal no orquestrador:", error);
    process.exit(1);
  } finally {
    // Log padronizado para captura pelo painel, mesmo em erro
    if (typeof imoveisRaspados !== 'undefined' && imoveisRaspados && Array.isArray(imoveisRaspados)) {
      console.log(`imóveis salvos: ${imoveisRaspados.length}`);
    }
    if (browser) {
      await browser.close();
      console.log("🚪 Navegador fechado.");
    }
  }
}

main();