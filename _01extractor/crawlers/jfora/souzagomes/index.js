import { backendRoot as ISOLATED_BACKEND_ROOT } from '../../../../backend-paths.cjs';
import { contarAntesDasVendas } from "../_utils/vendasContagem.js";
import { sincronizarVendas } from "../_utils/vendasSincronizacao.js";
import { getCollectionAsMap } from "../../../services/crawlerJson.js";
import fs from "fs";
import path from "path";
import { abrirBrowser } from "../../../services/puppeteerPool.js";
import { extractSouzaGomesData } from "./extractor.js";
import * as parser from "./parser.js";
import * as sheetsModule from "./sheets.js";

// 🔽 IMPORT DO ATUALIZADOR DE BAIRROS


// 🔽 IMPORT DO EXTRACTOR DO CARD 1
// import { extractCard1 } from "../../_cards/extractorCard1.js";

const COLLECTION_NAME = "jfSouzaGomes";
const KEY_FIELD = "linkReal";

async function main() {
  let totalDisponivelVendas;
  console.log("🚀 Iniciando orquestrador do crawler Souza Gomes...");
  let browser;

  // Garantir que o diretório de saída exista
  const outputDir = path.join(ISOLATED_BACKEND_ROOT, "crawler");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`📁 Diretório de saída 'crawler' criado.`);
  }

  try {
    // 1️⃣ Inicializar o navegador
    browser = await abrirBrowser();

    // 2️⃣ Carregar dados existentes do JSON local
    totalDisponivelVendas = await contarAntesDasVendas(browser, { projeto: COLLECTION_NAME });
    const existingDataMap = await getCollectionAsMap(COLLECTION_NAME, KEY_FIELD);
    console.log(`🔥 ${existingDataMap.size} registros existentes carregados.`);

    // 3️⃣ Extrair dados brutos do site (listagem)
    console.log(`[Index Debug] Tipo de browser antes da extração: ${typeof browser}`);
    const { imoveisRaspados, ignoradosCasaPet } = await extractSouzaGomesData(browser);
    console.log(`✅ ${imoveisRaspados.length} imóveis raspados da listagem (${ignoradosCasaPet} Casa Pet ignorados).`);
    // O contador do site inclui os produtos "Casa Pet", que nao sao imoveis.
    totalDisponivelVendas -= ignoradosCasaPet;
    // Adiciona log para o backend capturar corretamente o número de imóveis salvos
    console.log(`imóveis salvos: ${imoveisRaspados.length}`);

    const { enrichImoveisWithInternalData } = await import('./extractor-00-rotaInterna.js');
    await enrichImoveisWithInternalData(browser, imoveisRaspados);

    // 4️⃣ Consolidar dados (lógica de inclusão/exclusão)
    const dataConsolidada = parser.consolidateData(imoveisRaspados, existingDataMap);
    console.log(`📊 ${dataConsolidada.size} registros consolidados após a lógica de negócio.`);

    // 5️⃣ Salvar dados no Firebase


    // 6️⃣ Exportar para o Google Sheets
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
    } else {
      console.log("⚠️ Módulo sheets.js não exporta a função exportToSheets corretamente.");
    }

    console.log("\n🏁 Processo do crawler Souza Gomes finalizado com sucesso!");



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