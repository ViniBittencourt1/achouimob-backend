import { backendRoot as ISOLATED_BACKEND_ROOT } from '../../../../backend-paths.cjs';
import { contarAntesDasVendas } from "../_utils/vendasContagem.js";
import { sincronizarVendas } from "../_utils/vendasSincronizacao.js";
import { getCollectionAsMap } from "../../../services/crawlerJson.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import { abrirBrowser } from "../../../services/puppeteerPool.js";
import { extractDecisaoData } from "./extractor.js";
import { USER_AGENT_DECISAO } from "./config.js";
import * as parser from "./parser.js";
import * as sheetsModule from "./sheets.js";

// 🔽 IMPORT DO ATUALIZADOR DE BAIRROS
// import { listarBairrosMaiusculos } from "../_check/jfBairros.js";

// 🔽 IMPORT DO EXTRACTOR DO CARD 1
import { extractCard1 } from "../../_cards/extractorCard1.js";

const COLLECTION_NAME = "jfDecisao";
const KEY_FIELD = "linkReal";

async function main() {
  let totalDisponivelVendas;
  console.log("🚀 Iniciando orquestrador do crawler Decisao...");
  const startTime = Date.now();
  let browser;

  // 🔽 CORREÇÃO DA ROTA DE SALVAMENTO
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // Caminho absoluto direto para backend/crawler/jfDecisao.json
  const jfDecisaoPath = path.resolve(ISOLATED_BACKEND_ROOT, "crawler", "jfDecisao.json");
  const outputDir = path.dirname(jfDecisaoPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`📁 Diretório de saída '${outputDir}' garantido.`);
  }

  try {
    browser = await abrirBrowser({ headlessOverride: true });
    totalDisponivelVendas = await contarAntesDasVendas(browser, { projeto: COLLECTION_NAME, userAgent: USER_AGENT_DECISAO });
    const existingDataMap = await getCollectionAsMap(COLLECTION_NAME, KEY_FIELD);
    console.log(`🔥 ${existingDataMap.size} registros existentes carregados.`);

    const existingCodigoBaseSet = new Set(Array.from(existingDataMap.values()).map(item => String(item.codigoBase)));
    const { imoveisRaspados, novosImoveis } = await extractDecisaoData(browser, existingCodigoBaseSet);
    console.log(`✅ ${imoveisRaspados.length} imóveis raspados da listagem.`);
    console.log(`🆕 ${novosImoveis.length} imóveis novos para raspagem detalhada.`);

    const dataConsolidada = parser.consolidateData(imoveisRaspados, existingDataMap);
    console.log(`📊 ${dataConsolidada.size} registros consolidados após a lógica de negócio.`);

    // Salvamento no Firestore
    try {


    } catch (e) {
      console.error("❌ Erro ao salvar no Firestore:", e);
    }

    // 🔽 SALVAMENTO DO ARQUIVO JSON NA ROTA CORRIGIDA
    try {


    } catch (err) {
      console.error("❌ Erro ao salvar jfDecisao.json:", err);
    }

    const exportToSheets = sheetsModule.exportToSheets || sheetsModule.default;
    if (typeof exportToSheets === 'function') {
      await sincronizarVendas({
        totalEsperado: totalDisponivelVendas,
        vazioConfirmado: totalDisponivelVendas === 0,
        // Decisao reutiliza a mesma Ref em imoveis distintos (ex.: Ref 1058).
        codigoRepetidoPorLink: true,
        imoveisRaspados: imoveisRaspados,
        consolidados: dataConsolidada,
        imobiliaria: COLLECTION_NAME,
        exportToSheets: exportToSheets,
      });
      // Limpa o Map após exportar
      if (dataConsolidada && typeof dataConsolidada.clear === 'function') dataConsolidada.clear();
    }

    console.log("\n🏁 Processo do crawler Decisao finalizado com sucesso!");
  const endTime = Date.now();
  const durationMs = endTime - startTime;
  const durationMin = Math.floor(durationMs / 60000);
  const durationSec = Math.floor((durationMs % 60000) / 1000);
  console.log(`⏱️ Tempo total de execução: ${durationMin} min ${durationSec} s (${durationMs} ms)`);

    // Chamada a updateBairros removida pois não está definida

    try {
      const card1 = await extractCard1();
      if (card1) console.log("✅ Extração do card 1 concluída:", card1);
    } catch (err) {
      console.error("❌ Erro na extração do card 1:", err);
    }

  } catch (error) {
    console.error("\n❌ Erro fatal no orquestrador:", error);
    process.exit(1);
  } finally {
    // Log padronizado para captura pelo painel, mesmo em erro
    if (typeof dataConsolidada !== 'undefined' && dataConsolidada && typeof dataConsolidada.size === 'number') {
      console.log(`imóveis salvos: ${dataConsolidada.size}`);
    }
    if (browser) {
      await browser.close();
      console.log("🚪 Navegador fechado.");
    }
  }
}

main();