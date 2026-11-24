import { backendRoot as ISOLATED_BACKEND_ROOT } from '../../../../backend-paths.cjs';
import { contarAntesDasVendas } from "../_utils/vendasContagem.js";
import { sincronizarVendas } from "../_utils/vendasSincronizacao.js";
﻿import { getCollectionAsMap } from "../../../services/crawlerJson.js";
import fs from "fs";
import path from "path";
import { abrirBrowser } from "../../../services/puppeteerPool.js";
import { extractLocalData } from "./extractor.js";
import * as parser from "./parser.js";
import * as sheetsModule from "./sheets.js";

// ðŸ”½ IMPORT DO EXTRACTOR DO CARD 1
import { extractCard1 } from "../../_cards/extractorCard1.js";

const COLLECTION_NAME = "jfOliver";
const KEY_FIELD = "linkReal";

async function main() {
  let totalDisponivelVendas;
  console.log("Iniciando orquestrador do crawler Oliver...");
  let browser;
  let imoveisRaspados;
  let dataConsolidada;

  // Garantir que o diretÃ³rio de saÃ­da exista
  const outputDir = path.join(ISOLATED_BACKEND_ROOT, "crawler");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`ðŸ“ DiretÃ³rio de saÃ­da 'crawler' criado.`);
  }

  try {
    // 1ï¸âƒ£ Inicializar o navegador
    browser = await abrirBrowser({ headlessOverride: true });
    totalDisponivelVendas = await contarAntesDasVendas(browser, { projeto: COLLECTION_NAME });

    // 2ï¸âƒ£ Carregar dados existentes do JSON local
    const { linksBusca } = await import('./extractor-00-rotaExterna.js');
    const { extractLocalData } = await import('./extractor.js');

    const existingDataMap = await getCollectionAsMap(COLLECTION_NAME, KEY_FIELD);
    console.log(`ðŸ”¥ ${existingDataMap.size} registros existentes carregados.`);

    // 3ï¸âƒ£ Executar a raspagem completa de todos os links
    console.log(`ðŸ”— Total de links para raspagem: ${linksBusca.length}`);
    imoveisRaspados = await extractLocalData(browser, linksBusca, { totalEsperado: totalDisponivelVendas });
    console.log(`\n[FINAL] Total de cards raspados: ${imoveisRaspados.length}`);
    console.log(`${imoveisRaspados.length} imoveis raspados da listagem (Oliver).`);

    // 4ï¸âƒ£ Consolidar dados (lÃ³gica de inclusÃ£o/exclusÃ£o)
    dataConsolidada = parser.consolidateData(imoveisRaspados, existingDataMap);
    console.log(`ðŸ“Š ${dataConsolidada.size} registros consolidados apÃ³s a lÃ³gica de negÃ³cio.`);
  } catch (error) {
    console.error("\nâŒ Erro fatal no orquestrador:", error);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
      console.log("ðŸšª Navegador fechado.");
    }
    // Log padronizado para captura pelo painel, mesmo em erro
    if (imoveisRaspados && Array.isArray(imoveisRaspados)) {
      console.log(`imÃ³veis salvos: ${imoveisRaspados.length}`);
    }
    // 4ï¸âƒ£ Consolidar e exportar dados somente apÃ³s o fechamento do navegador
    if (typeof imoveisRaspados !== 'undefined') {
      console.log("\nðŸ”„ Iniciando salvamento dos dados...");
      const outputDir = path.join(ISOLATED_BACKEND_ROOT, "crawler");
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      const dadosParaSaida =
        dataConsolidada && dataConsolidada.size
          ? Array.from(dataConsolidada.values())
          : imoveisRaspados;
      const jfOliverPath = path.join(outputDir, "jfOliver.json");










      await sincronizarVendas({
        totalEsperado: totalDisponivelVendas,
        vazioConfirmado: totalDisponivelVendas === 0,
        imoveisRaspados: imoveisRaspados,
        consolidados: dataConsolidada,
        imobiliaria: COLLECTION_NAME,
        exportToSheets: sheetsModule.exportToSheets,
      });

      // ðŸ”½ ATUALIZA BAIRROS AO FINAL


      // ðŸ”½ EXTRAÃ‡ÃƒO DO CARD 1 AO FINAL
      console.log("\nðŸ“Œ Executando extraÃ§Ã£o do card 1...");
      try {
        const card1 = await extractCard1();
        if (card1) console.log("âœ… ExtraÃ§Ã£o do card 1 concluÃ­da:", card1);
      } catch (err) {
        console.error("âŒ Erro na extraÃ§Ã£o do card 1:", err);
      }

      console.log("\nProcesso do crawler Oliver finalizado com sucesso!");
    }
  }
}

main();
