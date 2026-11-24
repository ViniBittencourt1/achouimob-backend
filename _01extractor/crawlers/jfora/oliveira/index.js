import { backendRoot as ISOLATED_BACKEND_ROOT } from '../../../../backend-paths.cjs';
import { contarAntesDasVendas } from "../_utils/vendasContagem.js";
import { sincronizarVendas } from "../_utils/vendasSincronizacao.js";
import { getCollectionAsMap } from "../../../services/crawlerJson.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import { abrirBrowser } from "../../../services/puppeteerPool.js";
import { extractOliveiraData } from "./extractor.js";
import * as parser from "./parser.js";
import * as sheetsModule from "./sheets.js";

// 🔽 IMPORT DO ATUALIZADOR DE BAIRROS


// 🔽 IMPORT DO EXTRACTOR DO CARD 1
import { extractCard1 } from "../../_cards/extractorCard1.js";

const COLLECTION_NAME = "jfOliveira";
const KEY_FIELD = "linkReal";

async function main() {
  let totalDisponivelVendas;
  console.log("🚀 Iniciando orquestrador do crawler oliveira...");
  let browser;

  // 🔽 CORREÇÃO DA ROTA DE SALVAMENTO
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // Caminho absoluto direto para backend/crawler/jfOliveira.json
  const jfOliveiraPath = path.resolve(ISOLATED_BACKEND_ROOT, "crawler", "jfOliveira.json");
  const outputDir = path.dirname(jfOliveiraPath);
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
      // Simula navegador mobile
      await page.setUserAgent('Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36');
      await page.setViewport({ width: 390, height: 844, isMobile: true });
      // Garante que o link seja da versão mobile
      let mobileLink = link.replace('www.oliveiraimoveisjf.com.br/imovel/venda', 'www.oliveiraimoveisjf.com.br/mobile/imovel/venda');
      await page.goto(mobileLink, { waitUntil: 'networkidle0', timeout: 60000 });
      // Aguarda um tempo fixo para garantir carregamento dos cards
      await new Promise(resolve => setTimeout(resolve, 4000));
      const html = await page.content();
      const { imoveisRaspados } = extractOliveiraData(html, existingCodigoBaseSet);
      allImoveis = allImoveis.concat(imoveisRaspados);
      await page.close();
    }


    // Filtrar novos imóveis
    const novosImoveis = allImoveis.filter(imovel => !existingCodigoBaseSet.has(String(imovel.codigoBase)));
    console.log(`✅ ${allImoveis.length} imóveis raspados da listagem.`);
    console.log(`🆕 ${novosImoveis.length} imóveis novos para raspagem detalhada.`);

    // Chamar rota interna para preencher campos detalhados
    let imoveisDetalhados = allImoveis;
    if (novosImoveis.length > 0) {
      const { enrichImoveisWithInternalData } = await import('./extractor-00-rotaInterna.js');
      await enrichImoveisWithInternalData(browser, novosImoveis);
      // Atualiza os imóveis detalhados na lista principal
      imoveisDetalhados = allImoveis.map(imovel => {
        const detalhado = novosImoveis.find(n => n.linkReal === imovel.linkReal);
        return detalhado ? detalhado : imovel;
      });
    }

    const dataConsolidada = parser.consolidateData(imoveisDetalhados, existingDataMap);
    console.log(`📊 ${dataConsolidada.size} registros consolidados após a lógica de negócio.`);



    // 🔽 SALVAMENTO DO ARQUIVO JSON NA ROTA CORRIGIDA
    try {


    } catch (err) {
      console.error("❌ Erro ao salvar jfOliveira.json:", err);
    }

    const exportToSheets = sheetsModule.exportToSheets || sheetsModule.default;
    if (typeof exportToSheets === 'function') {
      await sincronizarVendas({
        totalEsperado: totalDisponivelVendas,
        vazioConfirmado: totalDisponivelVendas === 0,
        imoveisRaspados: imoveisDetalhados,
        consolidados: dataConsolidada,
        imobiliaria: COLLECTION_NAME,
        exportToSheets: exportToSheets,
      });
    }

    console.log("\n🏁 Processo do crawler Oliveira finalizado com sucesso!");

    // ...log de bairros removido...

    // Extração do card 1 removida por política do projeto.

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