import { scrapeListingPage } from "./extractor-00-rotaExterna.js";
import { scrapeFranquias } from './extractor-00-rotaInterna.js';
import { installRemaxSearchBatches } from './paginacao-api.js';
import { aguardarBuscaLocacaoRemax } from './busca-locacao.js';

const BASE_URL = "https://www.remax.com.br/listings?City=6579324&CityNM=6579324-Juiz+de+Fora%2C+Minas+Gerais&ListingClass=-1&TransactionTypeUID=261";

export async function extractRemaxData(browser, options = {}) {
  if (options.totalEsperado === 0) return { browser, imoveisRaspados: [] };
  const page = await browser.newPage();
  let imoveisDaLista;
  let api;
  try {
    if (options.negociacao === 'venda' || options.negociacao === 'locacao') {
      api = await installRemaxSearchBatches(page, { transactionType: options.negociacao === 'locacao' ? 260 : 261 });
    }
    const response = await page.goto(options.baseUrl ?? BASE_URL, { waitUntil: "networkidle2", timeout: 60000 });
    if ((options.negociacao === "locacao" || options.totalEsperado !== undefined) && !response?.ok()) throw new Error(`HTTP ${response?.status()} na busca RE/MAX.`);
    if (options.negociacao === "locacao") await aguardarBuscaLocacaoRemax(page, options.baseUrl);
    if (api) {
      const total = await api.waitUntilReady();
      await page.waitForFunction(expected => Array.from(document.querySelectorAll('p')).some(element => {
        const match = element.textContent.match(/^(\d[\d.]*)\s+N[uú]mero total de correspond[eê]ncias/i);
        return match && Number(match[1].replace(/\./g, '')) === expected;
      }), { polling: 'mutation', timeout: 30000 }, total);
      api.assertHealthy();
    }
    imoveisDaLista = await scrapeListingPage(page, options);
    if (api) api.assertHealthy();
  } finally { if (api) await api.close(); await page.close(); }

  await scrapeFranquias(browser, imoveisDaLista, options.existingDataMap);

  if (options.negociacao === "locacao") return { browser, imoveisRaspados: imoveisDaLista };

  // Log dos 10 primeiros imóveis (todos os campos, um por linha)
  for (let j = 0; j < Math.min(10, imoveisDaLista.length); j++) {
    const c = imoveisDaLista[j] || {};
    console.log(`\n===== Imóvel ${j + 1} =====`);
    Object.entries(c).forEach(([key, value]) => {
      if (typeof value !== 'object') {
        console.log(`${key} = ${value}`);
      }
    });
  }

  return { browser, imoveisRaspados: imoveisDaLista };
}