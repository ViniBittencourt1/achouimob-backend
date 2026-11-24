import { coletarVendasPadrao } from '../_utils/vendasPadraoPaginacao.js';
import { extractCidadeFromCardHtml } from './extractor-07-cidade.js';
import { extractLinkReal } from './extractor-01-linkReal.js';
import { extractTitulo } from './extractor-02-titulo.js';
import { extractPreco } from './extractor-03-preco.js';
import { extractLocalizacao } from './extractor-04-localizacao.js';
import { extractTipoImovel } from './extractor-05-tipoImovel.js';
import { extractBairro } from './extractor-06-bairrojs.js';
import { extractCidadeFromTituloEm } from './extractor-07-cidade.js';
import { extractDormitorioValor } from './extractor-08-dormitorioValor.js';
import { extractBanheiroValor } from './extractor-09-banheiroValor.js';
import { extractAmbienteValor } from './extractor-10-ambienteValor.js';
import { extractAreaValor } from './extractor-11-areaValor.js';
import { extractGaragemValor } from './extractor-12-garagemValor.js';
import { extractElevadorValor } from './extractor-13-elevadorValor.js';
import { extractCodigoBase } from './extractor-14-codigoBase.js';
import { extractLinkCard } from './extractor-15-linkCard.js';
import { extractCorretor } from './extractor-16-corretor.js';
import { extractDataInclusao } from './extractor-17-dataInclusao.js';
import { extractDataExclusao } from './extractor-18-dataExclusao.js';
import { extractLinkFoto } from './extractor-19-linkFoto.js';
import { extractAtualizadoEm } from './extractor-20-atualizadoEm.js';
import { coletarLocacaoPadrao as collectUniversalLocacaoCards } from '../_utils/locacaoPadraoPaginacao.js';
export { collectUniversalLocacaoCards };

export async function extractUniversalData(browser, linksBusca, options = {}) {
	let allImoveis = [];
	let totalCards = 0;
	for (const [idx, link] of linksBusca.entries()) {
		console.log(`\n[${idx + 1}/${linksBusca.length}] Acessando: ${link}`);
		const page = await browser.newPage();
		try {
			await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
			await page.setViewport({ width: 1280, height: 800 });
			const response = await page.goto(link, { waitUntil: 'networkidle2', timeout: 90000 });
			if (options.negociacao === 'locacao' && (!response || response.status() < 200 || response.status() >= 400)) throw new Error(`HTTP ${response?.status()} na busca Universal; dados anteriores preservados.`);
			console.log(`[${idx + 1}] Navegacao concluida para: ${link}`);
			try {
				await page.waitForSelector('lgpd-close', { timeout: 5000 });
				await page.evaluate(() => {
					const btn = document.querySelector('lgpd-close');
					if (btn && /prosseguir|ok/i.test(btn.textContent)) btn.click();
				});
				await page.waitForTimeout(500);
			} catch (e) {}
			let cardsData;
			if (options.negociacao === 'locacao') {
				cardsData = await collectUniversalLocacaoCards(page, link);
			} else {
				let paginacaoClicks = 0;
				if (options.totalEsperado === undefined) {
					while (paginacaoClicks < 50) {
						const btn = await page.$('button.more-results--button');
						if (!btn) break;
						await btn.click();
						paginacaoClicks++;
						console.log(`[${idx + 1}] Clique de paginacao #${paginacaoClicks}`);
						await new Promise(resolve => setTimeout(resolve, 3500));
					}
				}
				cardsData = options.totalEsperado !== undefined ? await coletarVendasPadrao(page, link, options.totalEsperado) : await page.$$eval('.imovel-item.imovel-item-show', cards => cards.map(card => card.outerHTML));
			}
			console.log(`[${idx + 1}] Cards encontrados: ${cardsData.length}`);
			for (const html of cardsData) {
				const titulo = await extractTitulo(html);
				const imovel = {
					linkReal: await extractLinkReal(html),
					titulo,
					preco: await extractPreco(html, options.negociacao),
					localizacao: await extractLocalizacao(html),
					tipoImovel: await extractTipoImovel(html, options.catalogos?.tipos),
					bairro: await extractBairro(html, '', options.catalogos?.bairros),
					cidade: extractCidadeFromCardHtml(html, options.catalogos?.cidades),
					dormitorioValor: await extractDormitorioValor(html),
					banheiroValor: await extractBanheiroValor(html),
					ambienteValor: await extractAmbienteValor(html),
					areaValor: await extractAreaValor(html),
					garagemValor: await extractGaragemValor(html),
					elevadorValor: await extractElevadorValor(html),
					codigoBase: await extractCodigoBase(html),
					linkCard: await extractLinkCard(html),
					corretor: await extractCorretor(html),
					dataInclusao: await extractDataInclusao(html),
					dataExclusao: await extractDataExclusao(html),
					linkFoto: await extractLinkFoto(html),
					atualizadoEm: await extractAtualizadoEm(html)
				};
				allImoveis.push(imovel);
				totalCards++;
				if (options.liberarMemoria && totalCards % 20 === 0 && global.gc) global.gc();
				if (options.liberarMemoria && totalCards % 100 === 0) console.log(`[Universal] Cards processados: ${totalCards}/${options.totalEsperado}.`);
					if (options.totalEsperado !== undefined && totalCards % 20 === 0) await new Promise(resolve => setImmediate(resolve));
				if (options.negociacao === 'locacao' && totalCards % 20 === 0) await new Promise(resolve => setImmediate(resolve));
			}
			console.log(`[${idx + 1}] Total acumulado de cards: ${totalCards}`);
		} finally { await page.close(); }
	}
	console.log(`\n[FINAL] Total de cards raspados: ${allImoveis.length}`);
	if (options.totalEsperado !== undefined && allImoveis.length !== options.totalEsperado) throw new Error(`Coleta incompleta: ${allImoveis.length}/${options.totalEsperado}; detalhes nao serao visitados e base preservada.`);
	return allImoveis;
}