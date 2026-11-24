import { backendRoot as ISOLATED_BACKEND_ROOT } from '../../../../backend-paths.cjs';
import { contarAntesDasVendas } from "../_utils/vendasContagem.js";
import { sincronizarVendas } from "../_utils/vendasSincronizacao.js";
import { getCollectionAsMap } from "../../../services/crawlerJson.js";
import fs from "fs";
import path from "path";
import { abrirBrowser } from "../../../services/puppeteerPool.js";
import { extractEstrelaSulData } from "./extractor.js";
import * as parser from "./parser.js";
import * as sheetsModule from "./sheets.js";

// 🔽 IMPORT DO ATUALIZADOR DE BAIRROS


// 🔽 IMPORT DO EXTRACTOR DO CARD 1
import { extractCard1 } from "../../_cards/extractorCard1.js";

const COLLECTION_NAME = "jfEstrelaSul";
const KEY_FIELD = "linkReal";

async function main() {
  let totalDisponivelVendas;
  console.log("🚀 Iniciando orquestrador do crawler EstrelaSul...");
  let browser;
  let imoveisRaspados;
  let dataConsolidada;

  // Garantir que o diretório de saída exista
  const outputDir = path.join(ISOLATED_BACKEND_ROOT, "crawler");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`📁 Diretório de saída 'crawler' criado.`);
  }

  try {
    // 1️⃣ Inicializar o navegador
    browser = await abrirBrowser();
    totalDisponivelVendas = await contarAntesDasVendas(browser, { projeto: COLLECTION_NAME });

    // 2️⃣ Carregar dados existentes do JSON local
    const { linksBusca } = await import('./extractor-00-rotaExterna.js');
    const { extractEstrelaSulData } = await import('./extractor.js');

    const existingDataMap = await getCollectionAsMap(COLLECTION_NAME, KEY_FIELD);
    console.log(`🔥 ${existingDataMap.size} registros existentes carregados.`);

    // 3️⃣ Executar a raspagem completa de todos os links
    console.log(`🔗 Total de links para raspagem: ${linksBusca.length}`);
    imoveisRaspados = await extractEstrelaSulData(browser, linksBusca, { totalEsperado: totalDisponivelVendas });
    console.log(`\n[FINAL] Total de cards raspados: ${imoveisRaspados.length}`);
    console.log(`✅ ${imoveisRaspados.length} imóveis raspados da listagem (EstrelaSul).`);

    // 4️⃣ Consolidar dados (lógica de inclusão/exclusão)
    dataConsolidada = parser.consolidateData(imoveisRaspados, existingDataMap);
    console.log(`📊 ${dataConsolidada.size} registros consolidados após a lógica de negócio.`);
  } catch (error) {
    console.error("\n❌ Erro fatal no orquestrador:", error);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
      console.log("🚪 Navegador fechado.");
    }
    // Log padronizado para captura pelo painel, mesmo em erro
    if (imoveisRaspados && Array.isArray(imoveisRaspados)) {
      console.log(`imóveis salvos: ${imoveisRaspados.length}`);
    }
    // 4️⃣ Consolidar e exportar dados somente após o fechamento do navegador
    if (typeof imoveisRaspados !== 'undefined') {
      console.log("\n🔄 Iniciando salvamento dos dados...");
      const outputDir = path.join(ISOLATED_BACKEND_ROOT, "crawler");
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      const jfEstrelaSulPath = path.join(outputDir, "jfEstrelaSul.json");





      try {


      } catch (e) {
        console.error("❌ Erro ao salvar no Firestore:", e);
      }


      await sincronizarVendas({
        totalEsperado: totalDisponivelVendas,
        vazioConfirmado: totalDisponivelVendas === 0,
        imoveisRaspados: imoveisRaspados,
        consolidados: dataConsolidada,
        imobiliaria: COLLECTION_NAME,
        exportToSheets: sheetsModule.exportToSheets,
      });


      console.log("\n🏁 Processo do crawler EstrelaSul finalizado com sucesso!");
      // 🔽 ATUALIZA BAIRROS AO FINAL


      // 🔽 EXTRAÇÃO DO CARD 1 AO FINAL
      console.log("\n📌 Executando extração do card 1...");
      try {
        const card1 = await extractCard1();
        if (card1) console.log("✅ Extração do card 1 concluída:", card1);
      } catch (err) {
        console.error("❌ Erro na extração do card 1:", err);
      }
    }
  }
}

main();