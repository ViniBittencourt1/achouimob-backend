import { backendRoot as ISOLATED_BACKEND_ROOT } from '../../../../backend-paths.cjs';
import { contarAntesDasVendas } from "../_utils/vendasContagem.js";
import { sincronizarVendas } from "../_utils/vendasSincronizacao.js";
import { getCollectionAsMap } from "../../../services/crawlerJson.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import { abrirBrowser } from "../../../services/puppeteerPool.js";
import { extractToc2Data } from "./extractor.js";
import * as parser from "./parser.js";
import * as sheetsModule from "./sheets.js";

// import { extractCard1 } from "../../_cards/extractorCard1.js";

const COLLECTION_NAME = "jfToc2";
const KEY_FIELD = "linkReal";

async function main() {
  let totalDisponivelVendas;
  console.log("🚀 Iniciando orquestrador do crawler toc2...");
  let browser;
  let imoveisRaspados = [];

  // 🔽 CORREÇÃO DA ROTA DE SALVAMENTO
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // Caminho absoluto direto para backend/crawler/jfToc2.json
  const jfToc2Path = path.resolve(ISOLATED_BACKEND_ROOT, "crawler", "jfToc2.json");
  const outputDir = path.dirname(jfToc2Path);
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
    const { gerarLinksBuscaAuto, validarUrlToc2Venda } = await import('./extractor-00-rotaExterna.js');
    const linksBusca = await gerarLinksBuscaAuto(browser);
    const paginasEsperadas = Math.ceil(totalDisponivelVendas / 12);
    if (linksBusca.length !== paginasEsperadas) {
      throw new Error(`[toc2] Paginacao incompleta: ${linksBusca.length}/${paginasEsperadas} paginas; base preservada.`);
    }

    let allImoveis = [];
    const linksVistos = new Set();
    for (let pagina = 0; pagina < linksBusca.length; pagina++) {
      const link = linksBusca[pagina];
      const page = await browser.newPage();
      try {
        const response = await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 120000 });
        if (!response?.ok()) throw new Error(`[toc2] HTTP ${response?.status()} na pagina ${pagina + 1}; base preservada.`);
        validarUrlToc2Venda(page.url(), pagina + 1);
        await page.waitForFunction(() => {
          const hasCards = document.querySelectorAll('[class*="ListPiecesProperties_card_horizontal1"] a[href*="/imovel/"]').length > 0;
          const heading = document.querySelector('h2[class*="Properties_qtd1"]')?.textContent || '';
          return hasCards && /\d+\s+Encontrados/i.test(heading);
        }, { timeout: 30000 });
        const totalDaPagina = await page.evaluate(() => {
          const heading = document.querySelector('h2[class*="Properties_qtd1"]')?.textContent || '';
          return Number(heading.match(/(\d+)\s+Encontrados/i)?.[1]);
        });
        if (totalDaPagina !== totalDisponivelVendas) {
          throw new Error(`[toc2] Total mudou na pagina ${pagina + 1}; base preservada.`);
        }
        const html = await page.content();
        const { imoveisRaspados: imoveisPagina } = extractToc2Data(html, existingCodigoBaseSet);
        const quantidadeEsperada = Math.min(12, totalDisponivelVendas - pagina * 12);
        if (imoveisPagina.length !== quantidadeEsperada) {
          throw new Error(`[toc2] Pagina ${pagina + 1} retornou ${imoveisPagina.length}/${quantidadeEsperada} cards; base preservada.`);
        }
        for (const imovel of imoveisPagina) {
          if (!imovel.linkReal || linksVistos.has(imovel.linkReal)) {
            throw new Error(`[toc2] Link ausente ou repetido na pagina ${pagina + 1}; base preservada.`);
          }
          linksVistos.add(imovel.linkReal);
        }
        allImoveis = allImoveis.concat(imoveisPagina);
      } finally {
        await page.close();
      }
    }
    imoveisRaspados = allImoveis;

    if (allImoveis.length !== totalDisponivelVendas) {
      throw new Error(`[toc2] Coleta incompleta: ${allImoveis.length}/${totalDisponivelVendas}; base preservada.`);
    }

    if (allImoveis.length === 0 && existingDataMap.size > 0) {
      throw new Error('[toc2] Nenhum imóvel raspado, abortando para evitar exclusão em massa.');
    }

    // Filtrar novos imóveis
    const novosImoveis = allImoveis.filter(imovel => !existingCodigoBaseSet.has(String(imovel.codigoBase)));
    console.log(`✅ ${allImoveis.length} imóveis raspados da listagem.`);
    // Log padronizado para captura pelo painel
    console.log(`imóveis salvos: ${allImoveis.length}`);
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

    // Envio em batches para evitar erro de payload
    const batchSize = 100;
    const registros = Array.from(dataConsolidada.values());
    for (let i = 0; i < registros.length; i += batchSize) {
      const lote = registros.slice(i, i + batchSize);

      console.log(`Batch enviado: ${i} até ${i + lote.length - 1}`);
    }

    // 🔽 SALVAMENTO DO ARQUIVO JSON NA ROTA CORRIGIDA
    try {


    } catch (err) {
      console.error("❌ Erro ao salvar jfToc2.json:", err);
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

    console.log("\n🏁 Processo do crawler toc2 finalizado com sucesso!");
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