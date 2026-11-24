import { backendRoot as ISOLATED_BACKEND_ROOT } from '../../../../backend-paths.cjs';
import { contarAntesDasVendas } from "../_utils/vendasContagem.js";
import { sincronizarVendas } from "../_utils/vendasSincronizacao.js";
import { getCollectionAsMap } from "../../../services/crawlerJson.js";
import fs from 'fs';
import path from 'path';
import { abrirBrowser } from '../../../services/puppeteerPool.js';
import { extractMegaData } from './extractor.js';
import { extractTipoImovel } from './extractor-05-tipoImovel.js';
import * as parser from './parser.js';
import * as sheetsModule from './sheets.js';

const COLLECTION_NAME = 'jfMega';
const KEY_FIELD = 'linkReal';

async function main() {
  let totalDisponivelVendas;
  console.log('🚀 Iniciando orquestrador do crawler Mega...');
  let browser;

  const outputDir = path.join(ISOLATED_BACKEND_ROOT, 'crawler');
  const outputPath = path.join(outputDir, 'jfMega.json');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {

    let existingDataMap;
    let existingCodigoBaseSet;
    let imoveisRaspados = [];
    let novosImoveis = [];

    const deveTentarFallbackNaoHeadless = process.env.CRAWLER_HEADLESS === 'true';
    const modosHeadlessTentativa = deveTentarFallbackNaoHeadless ? [true, false] : [undefined];

    for (let tentativa = 0; tentativa < modosHeadlessTentativa.length; tentativa++) {
      const headlessOverride = modosHeadlessTentativa[tentativa];
      const descricaoModo = typeof headlessOverride === 'boolean'
        ? `headless=${headlessOverride}`
        : 'headless do .env';

      try {
        console.log(`[Mega] Tentativa ${tentativa + 1}/${modosHeadlessTentativa.length} em modo ${descricaoModo}.`);
        browser = await abrirBrowser({ headlessOverride });
        totalDisponivelVendas = await contarAntesDasVendas(browser, { projeto: COLLECTION_NAME });
        existingDataMap = await getCollectionAsMap(COLLECTION_NAME, KEY_FIELD);
        console.log(`🔥 ${existingDataMap.size} registros existentes carregados.`);

        existingCodigoBaseSet = new Set(Array.from(existingDataMap.values()).map((item) => String(item.codigoBase || '')));
        const extraidos = await extractMegaData(browser, existingCodigoBaseSet);
        imoveisRaspados = extraidos.imoveisRaspados;
        novosImoveis = extraidos.novosImoveis;

        const executandoHeadlessSemFallback = headlessOverride !== false && tentativa < modosHeadlessTentativa.length - 1;
        if (imoveisRaspados.length === 0 && executandoHeadlessSemFallback) {
          console.warn('[Mega] 0 imóveis em modo headless. Tentando novamente em modo não-headless...');
          continue;
        }

        break;
      } catch (err) {
        const bloqueado = err?.code === 'MEGA_BLOCKED';
        const podeTentarFallback = tentativa < modosHeadlessTentativa.length - 1;

        if (bloqueado && podeTentarFallback) {
          console.warn('[Mega] Bloqueio detectado em headless. Retentando em modo não-headless...');
          continue;
        }

        throw err;
      } finally {
        if (browser) {
          await browser.close();
          browser = null;
          console.log('🚪 Navegador fechado.');
        }
      }
    }

    console.log(`✅ ${imoveisRaspados.length} imóveis raspados da listagem.`);
    console.log(`🆕 ${novosImoveis.length} imóveis novos para raspagem detalhada.`);

    if (imoveisRaspados.length === 0 && existingDataMap.size > 0) {
      throw new Error('[Mega] Nenhum imóvel raspado, abortando para evitar exclusão em massa.');
    }

    const dataConsolidada = parser.consolidateData(imoveisRaspados, existingDataMap);
    const tiposCatalogoPath = path.join(ISOLATED_BACKEND_ROOT, '_03database', 'filtros', '_brTipoImovel.json');
    const tiposValidos = new Set(Object.keys(JSON.parse(fs.readFileSync(tiposCatalogoPath, 'utf8')).tiposPorSlug || {}));
    let tiposNormalizados = 0;
    for (const imovel of dataConsolidada.values()) {
      if (tiposValidos.has(imovel.tipoImovel)) continue;
      const tipoNormalizado = extractTipoImovel('', imovel.tipoImovel);
      if (tipoNormalizado && tiposValidos.has(tipoNormalizado)) {
        imovel.tipoImovel = tipoNormalizado;
        tiposNormalizados += 1;
      }
    }
    console.log(`📊 ${dataConsolidada.size} registros consolidados após a lógica de negócio.`);
    if (tiposNormalizados) console.log(`[Mega] ${tiposNormalizados} tipo(s) legado(s) normalizado(s) pelo catálogo.`);





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
      if (typeof dataConsolidada.clear === 'function') dataConsolidada.clear();
    }

    console.log('\n🏁 Processo do crawler Mega finalizado com sucesso!');
  } catch (error) {
    console.error('\n❌ Erro fatal no orquestrador:', error);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
      console.log('🚪 Navegador fechado.');
    }
  }
}

main();
