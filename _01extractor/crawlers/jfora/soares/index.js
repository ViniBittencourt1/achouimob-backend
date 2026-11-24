import { backendRoot as ISOLATED_BACKEND_ROOT } from '../../../../backend-paths.cjs';
import { contarAntesDasVendas, aguardarContagemVendas } from "../_utils/vendasContagem.js";
import { projetoContagemVendas } from "../_utils/vendasContagemProjetos.js";
import { sincronizarVendas } from "../_utils/vendasSincronizacao.js";
import { getCollectionAsMap } from "../../../services/crawlerJson.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import { abrirBrowser } from "../../../services/puppeteerPool.js";
import { extractSoaresData } from "./extractor.js";
import * as parser from "./parser.js";
import * as sheetsModule from "./sheets.js";

// 🔽 IMPORT DO ATUALIZADOR DE BAIRROS


// 🔽 IMPORT DO EXTRACTOR DO CARD 1
// import { extractCard1 } from "../../_cards/extractorCard1.js";

const COLLECTION_NAME = "jfSoares";
const KEY_FIELD = "linkReal";

async function main() {
  let totalDisponivelVendas;
  console.log("🚀 Iniciando orquestrador do crawler Soares...");
  let browser;

  // 🔽 CORREÇÃO DA ROTA DE SALVAMENTO
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // Caminho absoluto direto para backend/crawler/jfSoares.json
  const jfSoaresPath = path.resolve(ISOLATED_BACKEND_ROOT, "crawler", "jfSoares.json");
  const outputDir = path.dirname(jfSoaresPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`📁 Diretório de saída '${outputDir}' garantido.`);
  }

  try {
    browser = await abrirBrowser();
    totalDisponivelVendas = await contarAntesDasVendas(browser, { projeto: COLLECTION_NAME });
    const existingDataMap = await getCollectionAsMap(COLLECTION_NAME, KEY_FIELD);
    console.log(`🔥 ${existingDataMap.size} registros existentes carregados.`);

    const existingCodigoBaseSet = new Set(Array.from(existingDataMap.values()).map(item => String(item.codigoBase)));

    // Obter links das páginas
    const { gerarLinksBuscaAuto } = await import('./extractor-00-rotaExterna.js');
    const linksBusca = await gerarLinksBuscaAuto(browser);

    let allImoveis = [];
    for (const link of linksBusca) {
      const page = await browser.newPage();
      try {
        await page.goto(link, { waitUntil: 'networkidle2', timeout: 60000 });
        await aguardarContagemVendas(page, projetoContagemVendas(COLLECTION_NAME));
        const html = await page.content();
        const { imoveisRaspados } = extractSoaresData(html, existingCodigoBaseSet);
        allImoveis = allImoveis.concat(imoveisRaspados);
      } finally {
        await page.close();
      }
    }
    // Adiciona log para o backend capturar corretamente o número de imóveis salvos
    console.log(`imóveis salvos: ${allImoveis.length}`);

    // Filtrar novos imóveis
    const novosImoveis = allImoveis.filter(imovel => !existingCodigoBaseSet.has(String(imovel.codigoBase)));
    console.log(`✅ ${allImoveis.length} imóveis raspados da listagem.`);
    console.log(`🆕 ${novosImoveis.length} imóveis novos para raspagem detalhada.`);

    const dataConsolidada = parser.consolidateData(allImoveis, existingDataMap);
    console.log(`📊 ${dataConsolidada.size} registros consolidados após a lógica de negócio.`);



    // 🔽 SALVAMENTO DO ARQUIVO JSON NA ROTA CORRIGIDA
    try {


    } catch (err) {
      console.error("❌ Erro ao salvar jfSoares.json:", err);
    }

    const exportToSheets = sheetsModule.exportToSheets || sheetsModule.default;
    if (typeof exportToSheets === 'function') {
      await sincronizarVendas({
        totalEsperado: totalDisponivelVendas,
        vazioConfirmado: totalDisponivelVendas === 0,
        imoveisRaspados: allImoveis,
        consolidados: dataConsolidada,
        imobiliaria: COLLECTION_NAME,
        exportToSheets: exportToSheets,
      });
    }

    console.log("\n🏁 Processo do crawler Soares finalizado com sucesso!");

    try {
      // const card1 = await extractCard1();
      // if (card1) console.log("✅ Extração do card 1 concluída:", card1); // REMOVIDO: extração de card não permitida
    } catch (err) {
      console.error("❌ Erro na extração do card 1:", err);
    }

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