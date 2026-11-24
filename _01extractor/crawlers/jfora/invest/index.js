import { backendRoot as ISOLATED_BACKEND_ROOT } from '../../../../backend-paths.cjs';
import { contarAntesDasVendas } from "../_utils/vendasContagem.js";
import { sincronizarVendas } from "../_utils/vendasSincronizacao.js";
// backend/src/crawlers/jfora/invest/index.js
import { getCollectionAsMap } from "../../../services/crawlerJson.js";
import fs from "fs";
import path from "path";
import { abrirBrowser } from "../../../services/puppeteerPool.js";
import { extractInvestData } from "./extractor.js";
import { consolidateData } from "./parser.js";
import { exportToSheets } from "./sheets.js";

// -------------------- Import do jfBairros --------------------


// -------------------- Import da extração do card 1 --------------------
// import { extractCard1 } from "../../_cards/extractorCard1.js";

const COLLECTION_NAME = "jfInvest";
const KEY_FIELD = "linkReal";

async function main() {
  let totalDisponivelVendas;
  console.log("🚀 Iniciando orquestrador do crawler INVEST...");
  let browser;

  let imoveisRaspados = [];
  try {
    // 1. Inicializar o navegador
    browser = await abrirBrowser();

    // 2. Carregar dados existentes
    totalDisponivelVendas = await contarAntesDasVendas(browser, { projeto: COLLECTION_NAME });
    const existingDataMap = await getCollectionAsMap(COLLECTION_NAME, KEY_FIELD);
    console.log(`🔥 ${existingDataMap.size} registros existentes carregados.`);

    // 3. Extrair dados brutos
    const resultado = await extractInvestData(browser, { totalEsperado: totalDisponivelVendas });
    imoveisRaspados = resultado.imoveisRaspados || [];
    console.log(`✅ ${imoveisRaspados.length} imóveis raspados da listagem.`);
    // Adiciona log para o backend capturar corretamente o número de imóveis salvos
    console.log(`imóveis salvos: ${imoveisRaspados.length}`);

    // 4. Consolidar
    const dataConsolidada = consolidateData(imoveisRaspados, existingDataMap);
    console.log(`📊 ${dataConsolidada.size} registros consolidados após a lógica de negócio.`);

    const outputDir = path.join(ISOLATED_BACKEND_ROOT, "crawler");
    fs.mkdirSync(outputDir, { recursive: true });
    const dadosParaSaida = Array.from(dataConsolidada.values());



    // 5. Salvar no Firebase
    try {


    } catch (e) {
      console.error("❌ Erro ao salvar no Firestore:", e);
    }

    // 6. Exportar ao Sheets
    await sincronizarVendas({
        totalEsperado: totalDisponivelVendas,
        vazioConfirmado: totalDisponivelVendas === 0,
      imoveisRaspados: imoveisRaspados,
      consolidados: dataConsolidada,
      imobiliaria: COLLECTION_NAME,
      exportToSheets: exportToSheets,
    });

    console.log("\n🏁 Processo do crawler INVEST finalizado com sucesso!");

    // -------------------- Atualizar bairros --------------------
    // console.log("\n📌 Atualizando lista de bairros via jfBairros..."); // REMOVIDO: atualização de bairros não permitida

    // -------------------- Extrair card 1 (removido extractCard1)

  } catch (error) {
    console.error("\n❌ Erro fatal no orquestrador:", error);
    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close();
      console.log("🚪 Navegador fechado.");
    }
    // Log padronizado para captura pelo painel, mesmo em erro
    if (imoveisRaspados && Array.isArray(imoveisRaspados)) {
      console.log(`imóveis salvos: ${imoveisRaspados.length}`);
    }
  }
}

main();