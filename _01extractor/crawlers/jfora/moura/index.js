import { pathToFileURL } from 'node:url';
import { contarAntesDasVendas } from '../_utils/vendasContagem.js';
import { sincronizarVendas } from '../_utils/vendasSincronizacao.js';
import { getCollectionAsMap } from '../../../services/crawlerJson.js';
import { abrirBrowser } from '../../../services/puppeteerPool.js';
import { extractLocalData } from './extractor.js';
import { linksBusca } from './extractor-00-rotaExterna.js';
import { consolidateData } from './parser.js';
import { exportToSheets } from './sheets.js';
import { extractCard1 } from '../../_cards/extractorCard1.js';

const COLLECTION_NAME = 'jfMoura';
const KEY_FIELD = 'linkReal';

export async function main() {
  console.log('[Moura] Iniciando crawler...');
  let browser;
  let totalDisponivelVendas;
  let imoveisRaspados;
  let dataConsolidada;
  try {
    browser = await abrirBrowser({ headlessOverride: true });
    totalDisponivelVendas = await contarAntesDasVendas(browser, { projeto: COLLECTION_NAME });
    const existingDataMap = await getCollectionAsMap(COLLECTION_NAME, KEY_FIELD);
    imoveisRaspados = await extractLocalData(browser, linksBusca, { totalEsperado: totalDisponivelVendas });
    dataConsolidada = consolidateData(imoveisRaspados, existingDataMap);
  } finally {
    if (browser) await browser.close();
  }

  await sincronizarVendas({
    totalEsperado: totalDisponivelVendas,
    vazioConfirmado: totalDisponivelVendas === 0,
    imoveisRaspados,
    consolidados: dataConsolidada,
    imobiliaria: COLLECTION_NAME,
    exportToSheets,
  });
  console.log(`[Moura] imoveis salvos: ${imoveisRaspados.length}`);
  try {
    await extractCard1();
  } catch (error) {
    console.error('[Moura] Erro na extracao do card 1:', error);
  }
  console.log('[Moura] Processo finalizado com sucesso!');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error('[Moura] Erro fatal no orquestrador:', error);
    process.exitCode = 1;
  });
}
