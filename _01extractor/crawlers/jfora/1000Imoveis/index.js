import { backendRoot as ISOLATED_BACKEND_ROOT } from '../../../../backend-paths.cjs';
import { contarAntesDasVendas } from "../_utils/vendasContagem.js";
import { getCollectionAsMap } from "../../../services/crawlerJson.js";
import { sincronizarVendas } from "../_utils/vendasSincronizacao.js";
import fs from "fs";
import path from "path";
import { abrirBrowser } from "../../../services/puppeteerPool.js";
import { extractMilImoveisData } from "./extractor.js";
import * as parser from "./parser.js";
import * as sheetsModule from "./sheets.js";

// 🔽 IMPORT DO ATUALIZADOR DE BAIRROS
// import { listarBairrosMaiusculos } from "../_check/jfBairros.js";

// 🔽 IMPORT DO EXTRACTOR DO CARD 1
// import { extractCard1 } from "../../_cards/extractorCard1.js";

const COLLECTION_NAME = "jf1000Imoveis";
const KEY_FIELD = "linkReal";

async function main() {
  let totalDisponivelVendas;
  console.log("🚀 Iniciando orquestrador do crawler 1000Imoveis...");
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
    const { extractMilImoveisData } = await import('./extractor.js');

    const existingDataMap = await getCollectionAsMap(COLLECTION_NAME, KEY_FIELD);
    console.log(`🔥 ${existingDataMap.size} registros existentes carregados.`);

    // 3️⃣ Executar a raspagem completa de todos os links
    console.log(`🔗 Total de links para raspagem: ${linksBusca.length}`);
    imoveisRaspados = await extractMilImoveisData(browser, linksBusca, {
      totalEsperado: totalDisponivelVendas,
      validarTotalPorPagina: true,
      paginacaoEndpoint: true,
      linkSemFaixa: "https://1000imoveisjf.com.br/imoveis?order=recentes&negociacao=venda",
      recontarTotal: () => contarAntesDasVendas(browser, { projeto: COLLECTION_NAME }),
    });
    if (Number.isInteger(imoveisRaspados.totalConfirmado)) totalDisponivelVendas = imoveisRaspados.totalConfirmado;
    console.log(`\n[FINAL] Total de cards raspados: ${imoveisRaspados.length}`);
    console.log(`✅ ${imoveisRaspados.length} imóveis raspados da listagem (1000Imoveis).`);

    const { enrichImoveisWithInternalData } = await import('./extractor-00-rotaInterna.js');
    await enrichImoveisWithInternalData(browser, imoveisRaspados);

    // 4️⃣ Consolidar dados (lógica de inclusão/exclusão)
    dataConsolidada = parser.consolidateData(imoveisRaspados, existingDataMap);
    console.log(`📊 ${dataConsolidada.size} registros consolidados após a lógica de negócio.`);
  } finally {
    if (browser) {
      await browser.close();
      console.log("🚪 Navegador fechado.");
    }
  }

  console.log("\n🔄 Iniciando salvamento dos dados...");
  await sincronizarVendas({
    totalEsperado: totalDisponivelVendas,
    vazioConfirmado: totalDisponivelVendas === 0,
    imoveisRaspados,
    consolidados: dataConsolidada,
    imobiliaria: COLLECTION_NAME,
    exportToSheets: sheetsModule.exportToSheets,
  });
  console.log(`imóveis salvos: ${imoveisRaspados.length}`);
  console.log("\n🏁 Processo do crawler 1000Imoveis finalizado com sucesso!");
}

main().catch((error) => {
  console.error("\n❌ Erro fatal no orquestrador:", error);
  process.exitCode = 1;
});