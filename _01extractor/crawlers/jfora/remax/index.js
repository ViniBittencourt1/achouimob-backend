import { contarAntesDasVendas } from "../_utils/vendasContagem.js";
import { sincronizarVendas } from "../_utils/vendasSincronizacao.js";
import { getCollectionAsMap } from "../../../services/crawlerJson.js";
import fs from 'node:fs';
import { abrirBrowser } from "../../../services/puppeteerPool.js";
import { extractRemaxData } from "./extractor.js";
import { consolidateData } from "./parser.js";
import { exportToSheets } from "./sheets.js";

// 🔽 IMPORTAÇÃO DO ATUALIZADOR DE BAIRROS


// 🔽 IMPORTAÇÃO DO EXTRACTOR DO CARD 1
import { extractCard1 } from "../../_cards/extractorCard1.js";

const COLLECTION_NAME = "jfRemax";
const KEY_FIELD = "linkReal";

async function main() {
  let totalDisponivelVendas;
  console.log("🚀 Iniciando orquestrador do crawler RE/MAX...");
  let browser;

  try {
    // 1️⃣ Inicializar o navegador
    browser = await abrirBrowser();

    // 2️⃣ Carregar dados existentes do JSON local
    totalDisponivelVendas = await contarAntesDasVendas(browser, { projeto: COLLECTION_NAME });
    const existingDataMap = await getCollectionAsMap(COLLECTION_NAME, KEY_FIELD);
    console.log(`🔥 ${existingDataMap.size} registros existentes carregados.`);
    const cachePath = new URL('../../../../crawler/jfRemax.json', import.meta.url);
    const cachedRecords = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, 'utf8')) : [];
    const franquiasSalvas = new Map(cachedRecords.map(imovel => [imovel.linkReal, { corretor: imovel.corretor }]));

    // 3️⃣ Extrair dados brutos do site (listagem)
    const { imoveisRaspados } = await extractRemaxData(browser, { existingDataMap: franquiasSalvas, negociacao: 'venda', totalEsperado: totalDisponivelVendas });
    console.log(`✅ ${imoveisRaspados.length} imóveis raspados da listagem.`);
    // Adiciona log para o backend capturar corretamente o número de imóveis salvos
    console.log(`imóveis salvos: ${imoveisRaspados.length}`);

    // 4️⃣ Consolidar dados
    const dataConsolidada = consolidateData(imoveisRaspados, existingDataMap);
    console.log(`📊 ${dataConsolidada.size} registros consolidados após a lógica de negócio.`);

    // 5️⃣ Atualizar dados no Firebase
    if (dataConsolidada && dataConsolidada.size > 0) {



    } else {

    }

    // 6️⃣ Exportar dados para o Google Sheets
    await sincronizarVendas({
        totalEsperado: totalDisponivelVendas,
        vazioConfirmado: totalDisponivelVendas === 0,
      imoveisRaspados: imoveisRaspados,
      consolidados: dataConsolidada,
      imobiliaria: COLLECTION_NAME,
      exportToSheets: exportToSheets,
    });

    console.log("\n🏁 Processo do crawler RE/MAX finalizado com sucesso!");

    // 🔽 ATUALIZA BAIRROS AO FINAL DE TUDO
      console.log("\n📌 Atualizando lista de bairros (jfBairros)... (removido updateBairros pois não está definido)")

    // 🔽 EXTRAÇÃO DO CARD 1 AO FINAL
    console.log("\n📌 Executando extração do card 1...");
    try {
      const card1 = await extractCard1();
      if (card1) console.log("✅ Extração do card 1 concluída:", card1);
    } catch (err) {
      console.error("❌ Erro na extração do card 1:", err);
    }

  } catch (error) {
    console.error("\n❌ Erro fatal no orquestrador:", error);
    // process.exit(1); // Removido para permitir continuidade
    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close();
      console.log("🚪 Navegador fechado.");
    }
  }
}

main();