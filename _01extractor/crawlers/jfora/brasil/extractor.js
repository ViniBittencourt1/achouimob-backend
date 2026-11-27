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

export async function extractBrasilData(browser, linksBusca, options = {}) {
	let allImoveis = [];
	let totalCards = 0;
	const MAX_TENTATIVAS_NAV = 3;
	const ESPERA_ENTRE_TENTATIVAS_MS = 4000;
	for (const [idx, link] of linksBusca.entries()) {
		console.log(`\n[${idx + 1}/${linksBusca.length}] Acessando: ${link}`);
		const page = await browser.newPage();
		try {
			await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
			await page.setViewport({ width: 1280, height: 800 });

			let navegacaoOk = false;
			for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_NAV; tentativa++) {
				try {
					const response = await page.goto(link, { waitUntil: 'networkidle2', timeout: 90000 });
					if (options.catalogos) {
						const expected = new URL(link);
						const actual = new URL(page.url());
						if (!response || !response.ok() || actual.origin !== expected.origin ||
							actual.pathname !== expected.pathname || actual.searchParams.get('negociacao') !== expected.searchParams.get('negociacao')) {
							throw new Error('[Brasil] Busca com HTTP invalido ou redirecionada; dados preservados.');
						}
					}
					navegacaoOk = true;
					break;
				} catch (err) {
					const mensagem = err?.message || String(err);
					console.warn(`[${idx + 1}] Falha de navegação (tentativa ${tentativa}/${MAX_TENTATIVAS_NAV}): ${mensagem}`);
					if (tentativa < MAX_TENTATIVAS_NAV) {
						await new Promise(resolve => setTimeout(resolve, ESPERA_ENTRE_TENTATIVAS_MS));
					}
				}
			}

			if (!navegacaoOk) {
				if (options.catalogos) throw new Error(`[Brasil] Navegacao falhou apos ${MAX_TENTATIVAS_NAV} tentativas; dados preservados.`);
				console.error(`[${idx + 1}] Link ignorado após ${MAX_TENTATIVAS_NAV} tentativas: ${link}`);
				continue;
			}

			console.log(`[${idx + 1}] Navegação concluída para: ${link}`);
			// Clicar LGPD se aparecer
			try {
				await page.waitForSelector('lgpd-close', { timeout: 5000 });
				await page.evaluate(() => {
					const btn = document.querySelector('lgpd-close');
					if (btn && /prosseguir|ok/i.test(btn.textContent)) btn.click();
				});
				await page.waitForTimeout(500);
			} catch (e) {}
			console.log(`[${idx + 1}] Iniciando loop de paginação...`);
			let paginacaoClicks = 0;
			let cardsCarregados = (await page.$$('.imovel-item.imovel-item-show')).length;
			while (true) {
				if (Number.isInteger(options.totalEsperado) && cardsCarregados === options.totalEsperado) break;
				if (Number.isInteger(options.totalEsperado) && cardsCarregados > options.totalEsperado) {
					throw new Error(`[Brasil] Cards excederam a precontagem: ${cardsCarregados}/${options.totalEsperado}.`);
				}
				const btn = await page.$('button.more-results--button');
				if (!btn) {
					if (Number.isInteger(options.totalEsperado) && cardsCarregados !== options.totalEsperado) {
						throw new Error(`[Brasil] Botao de mais resultados ausente em ${cardsCarregados}/${options.totalEsperado}.`);
					}
					break;
				}
				await new Promise(resolve => setTimeout(resolve, 1000));
				await btn.click();
				paginacaoClicks++;
				console.log(`[${idx + 1}] Clique de paginação #${paginacaoClicks}`);
				if (Number.isInteger(options.totalEsperado)) {
					await page.waitForFunction(previous => document.querySelectorAll('.imovel-item.imovel-item-show').length > previous, { timeout: 60000 }, cardsCarregados);
					cardsCarregados = (await page.$$('.imovel-item.imovel-item-show')).length;
					console.log(`[Brasil] Cards carregados: ${cardsCarregados}/${options.totalEsperado}.`);
				} else {
					await new Promise(resolve => setTimeout(resolve, 3500));
				}
			}
			console.log(`[${idx + 1}] Fim do loop de paginação. Iniciando busca dos cards...`);
			// Raspagem dos cards
			const cards = await page.$$('.imovel-item.imovel-item-show');
			console.log(`[${idx + 1}] Cards encontrados: ${cards.length}`);
			if (Number.isInteger(options.totalEsperado) && cards.length !== options.totalEsperado) {
				throw new Error(`[Brasil] Coleta incompleta: ${cards.length}/${options.totalEsperado}.`);
			}
			if (cards.length === 0) {
				continue;
			}
			for (const card of cards) {
				const html = await page.evaluate(el => el.outerHTML, card);
				const titulo = await extractTitulo(html);
				const linkReal = await extractLinkReal(html);
				const cidade = extractCidadeFromCardHtml(html, options.catalogos?.cidades);
				const imovel = {
					linkReal,
					titulo,
					preco: await extractPreco(html, options.negociacao),
					localizacao: await extractLocalizacao(html),
					tipoImovel: await extractTipoImovel(html, options.catalogos?.tipos),
					bairro: await extractBairro(html, cidade, linkReal, options.catalogos?.bairros),
					cidade,
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
			}
			console.log(`[${idx + 1}] Total acumulado de cards: ${totalCards}`);
		} catch (err) {
			if (options.catalogos) throw err;
			console.error(`[${idx + 1}] Erro ao processar o link. Pulando para o próximo...`);
			console.error(err?.message || err);
		} finally {
			try {
				await page.close();
			} catch (e) {
				if (options.catalogos) throw e;
			}
		}
	}
	console.log(`\n[FINAL] Total de cards raspados: ${allImoveis.length}`);
	if (Number.isInteger(options.totalEsperado) && allImoveis.length !== options.totalEsperado) {
		throw new Error(`[Brasil] Total raspado divergente: ${allImoveis.length}/${options.totalEsperado}.`);
	}
	if (options.catalogos && new Set(allImoveis.map(item => item.linkReal)).size !== allImoveis.length) {
		throw new Error('[Brasil] Links de imoveis duplicados na coleta.');
	}
	return allImoveis;
}
