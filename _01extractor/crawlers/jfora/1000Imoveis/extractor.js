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

const CARD_SELECTOR = '.imovel-item.imovel-item-show';
const PAGINATION_BUTTON_SELECTOR = 'button.more-results--button';
const MAX_PAGINATION_CLICKS = 200;

export async function carregarResultadosPorEndpoint(page, {
	logPrefix = '1',
	totalEsperado,
	maxPages = MAX_PAGINATION_CLICKS,
	maxAttempts = 3,
	sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
	if (!Number.isSafeInteger(totalEsperado) || totalEsperado < 0) {
		throw new Error(`[${logPrefix}] Total esperado inválido para paginação.`);
	}
	let paginas = 0;
	let cardsCarregados = (await page.$$(CARD_SELECTOR)).length;
	while (cardsCarregados < totalEsperado) {
		if (paginas >= maxPages) throw new Error(`[${logPrefix}] Limite de ${maxPages} páginas atingido.`);
		let resultado;
		for (let tentativa = 1; tentativa <= maxAttempts; tentativa++) {
			resultado = await page.evaluate(async () => {
				const paginacao = document.querySelector('[data-pagination-more-url]');
				if (!paginacao) return { erro: 'Próxima página ausente', transitorio: false };
				const url = new URL(paginacao.dataset.paginationMoreUrl, location.href);
				const atual = new URL(location.href);
				if (url.origin !== atual.origin || url.pathname !== atual.pathname ||
					['negociacao', 'preco_min', 'preco_max'].some(chave =>
						(url.searchParams.get(chave) || '') !== (atual.searchParams.get(chave) || ''))) {
					return { erro: 'URL da próxima página não corresponde à busca', transitorio: false };
				}
				if (paginacao.dataset.paginationMoreModule !== 'imoveis') {
					return { erro: 'Módulo de paginação inválido', transitorio: false };
				}
				url.searchParams.set('tmpl', 'imoveis/list_items');
				const controller = new AbortController();
				const timer = setTimeout(() => controller.abort(), 25000);
				let resposta;
				let html;
				try {
					resposta = await fetch(url.href, { signal: controller.signal });
					if (!resposta.ok) return { erro: `HTTP ${resposta.status}`, transitorio: resposta.status === 429 || resposta.status >= 500 };
					if (resposta.redirected) return { erro: 'Redirecionamento inesperado na paginação', transitorio: false };
					html = await resposta.text();
				} catch (erro) {
					return { erro: `Falha ao carregar página: ${erro.message}`, transitorio: true };
				} finally {
					clearTimeout(timer);
				}
				const documento = new DOMParser().parseFromString(html, 'text/html');
				const novosCards = documento.querySelectorAll('.imovel-item');
				const destino = document.querySelector('[data-listing-imoveis]');
				if (!destino || !novosCards.length) return { erro: 'Resposta de paginação sem cards ou listagem', transitorio: false };
				novosCards.forEach(card => card.classList.add('imovel-item-show'));
				paginacao.remove();
				for (const elemento of [...documento.body.children]) destino.appendChild(elemento);
				return { cards: novosCards.length };
			});
			if (!resultado.erro) break;
			if (!resultado.transitorio || tentativa === maxAttempts) {
				throw new Error(`[${logPrefix}] Falha na paginação: ${resultado.erro}`);
			}
			console.warn(`[${logPrefix}] ${resultado.erro}; tentativa ${tentativa}/${maxAttempts}.`);
			await sleep(2000 * tentativa);
		}
		paginas++;
		cardsCarregados = (await page.$$(CARD_SELECTOR)).length;
		console.log(`[${logPrefix}] Página adicional #${paginas}: ${resultado.cards} cards; ${cardsCarregados}/${totalEsperado}.`);
	}
	return { paginas, cardsCarregados };
}

export async function carregarTodosResultados(page, {
	logPrefix = '1',
	totalEsperado,
	maxClicks = MAX_PAGINATION_CLICKS,
	maxNoGrowthAttempts = 3,
	waitAfterClickMs = 10000,
	pollIntervalMs = 500,
	retryClickMs = 2000,
	sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
	let paginacaoClicks = 0;
	let tentativasSemNovosCards = 0;
	let cardsCarregados = (await page.$$(CARD_SELECTOR)).length;

	while (!Number.isInteger(totalEsperado) || cardsCarregados < totalEsperado) {
		if (paginacaoClicks >= maxClicks) {
			console.warn(`[${logPrefix}] Paginação interrompida no limite de segurança de ${maxClicks} cliques (${cardsCarregados} cards).`);
			break;
		}

		const cardsAntes = cardsCarregados;
		let clicou = false;
		let erroTransitorio = false;
		try {
			const btn = await page.$(PAGINATION_BUTTON_SELECTOR);
			if (btn) {
				const indisponivel = await page.evaluate(
					(element) => element.disabled || element.classList.contains('disabled') || element.offsetParent === null,
					btn,
				);
				if (!indisponivel) {
					await page.evaluate((element) => element.scrollIntoView({ block: 'center' }), btn);
					await btn.click();
					clicou = true;
				}
			}
		} catch (err) {
			if (!/not clickable|not an element|detached|not attached|no node with given id/i.test(err?.message || '')) throw err;
			erroTransitorio = true;
			console.warn(`[${logPrefix}] Botão de paginação mudou durante o clique: ${err.message}`);
		}
		if (!clicou) {
			if (!Number.isInteger(totalEsperado) && !erroTransitorio) break;
			await sleep(retryClickMs);
			cardsCarregados = (await page.$$(CARD_SELECTOR)).length;
			if (cardsCarregados > cardsAntes) {
				tentativasSemNovosCards = 0;
				continue;
			}
			tentativasSemNovosCards++;
			console.warn(`[${logPrefix}] Botão indisponível (${cardsCarregados}/${totalEsperado} cards); tentativa ${tentativasSemNovosCards}/${maxNoGrowthAttempts}.`);
			if (tentativasSemNovosCards >= maxNoGrowthAttempts) break;
			continue;
		}
		paginacaoClicks++;
		console.log(`[${logPrefix}] Clique de paginação #${paginacaoClicks}`);

		const limiteEspera = Date.now() + waitAfterClickMs;
		do {
			await sleep(Math.min(pollIntervalMs, Math.max(0, limiteEspera - Date.now())));
			cardsCarregados = (await page.$$(CARD_SELECTOR)).length;
			if (cardsCarregados > cardsAntes) break;
		} while (Date.now() < limiteEspera);

		if (cardsCarregados <= cardsAntes) {
			tentativasSemNovosCards++;
			console.warn(`[${logPrefix}] Nenhum card novo após o clique #${paginacaoClicks} (${cardsCarregados} cards); tentativa sem progresso ${tentativasSemNovosCards}/${maxNoGrowthAttempts}.`);
			if (tentativasSemNovosCards >= maxNoGrowthAttempts) {
				console.warn(`[${logPrefix}] Paginação interrompida após ${tentativasSemNovosCards} tentativas sem progresso (${cardsCarregados} cards).`);
				break;
			}
			continue;
		}
		tentativasSemNovosCards = 0;
	}

	return { paginacaoClicks, cardsCarregados };
}

export async function extractMilImoveisData(browser, linksBusca, options = {}) {
	let allImoveis = [];
	const linksVistos = new Set();
	let duplicados = 0;
	let totalCards = 0;
	const MAX_TENTATIVAS_NAV = 3;
	const ESPERA_ENTRE_TENTATIVAS_MS = 4000;
	const LIMITE_MEMORIA = 20;

	for (const [idx, link] of linksBusca.entries()) {
		console.log(`\n[${idx + 1}/${linksBusca.length}] Acessando: ${link}`);
		const page = await browser.newPage();

		try {
			await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
			await page.setViewport({ width: 1280, height: 800 });

			let navegacaoOk = false;
			for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_NAV; tentativa++) {
				try {
					await page.goto(link, { waitUntil: 'networkidle2', timeout: 90000 });
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
				console.error(`[${idx + 1}] Link ignorado após ${MAX_TENTATIVAS_NAV} tentativas: ${link}`);
				if (options.validarTotalPorPagina) throw new Error(`[1000Imoveis] Não foi possível acessar a faixa: ${link}`);
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

			let totalDaPagina = options.totalEsperado;
			if (options.validarTotalPorPagina) {
				const textoTotal = await page.$eval('#title--label', element => element.textContent);
				const matchTotal = textoTotal.match(/\(\s*([\d.]+)\s*\)/);
				if (!matchTotal) throw new Error(`[1000Imoveis] Contagem da faixa inválida: ${textoTotal}`);
				totalDaPagina = Number(matchTotal[1].replace(/\./g, ''));
				if (!Number.isSafeInteger(totalDaPagina)) throw new Error(`[1000Imoveis] Contagem da faixa inválida: ${textoTotal}`);
				console.log(`[${idx + 1}] Total da faixa: ${totalDaPagina}`);
			}
			console.log(`[${idx + 1}] Iniciando loop de paginação...`);
			if (options.paginacaoEndpoint) {
				await carregarResultadosPorEndpoint(page, { logPrefix: idx + 1, totalEsperado: totalDaPagina });
			} else {
				await carregarTodosResultados(page, {
					logPrefix: idx + 1,
					totalEsperado: totalDaPagina,
				});
			}

			console.log(`[${idx + 1}] Fim do loop de paginação. Iniciando busca dos cards...`);
			// Raspagem dos cards - OTIMIZADO
			const cardsData = await page.evaluate(() => {
				const cardElements = document.querySelectorAll('.imovel-item.imovel-item-show');
				return Array.from(cardElements).map(el => el.outerHTML);
			});

			console.log(`[${idx + 1}] Cards encontrados: ${cardsData.length}`);
			if (options.validarTotalPorPagina && cardsData.length < totalDaPagina) {
				throw new Error(`[1000Imoveis] Faixa incompleta: ${cardsData.length}/${totalDaPagina} cards.`);
			}
			if (cardsData.length === 0) {
				continue;
			}

			// Processar cards com limpeza de memória
			const linksDaPagina = new Set();
			for (const html of cardsData) {
				try {
					const titulo = await extractTitulo(html);
					const linkReal = await extractLinkReal(html);
					if (linkReal) linksDaPagina.add(linkReal);
					// Anúncio novo durante o "carregar mais" desloca a lista e repete um card.
					if (linkReal && linksVistos.has(linkReal)) {
						duplicados++;
						continue;
					}
					if (linkReal) linksVistos.add(linkReal);
					const cidade = extractCidadeFromCardHtml(html);
					const imovel = {
						linkReal,
						titulo,
						preco: await extractPreco(html, options.negociacao),
						localizacao: await extractLocalizacao(html),
						tipoImovel: await extractTipoImovel(html),
						bairro: await extractBairro(html, linkReal, cidade),
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

					// Forçar limpeza de memória periodicamente
					if (totalCards % LIMITE_MEMORIA === 0) {
						await new Promise(resolve => setImmediate(resolve));
						if (global.gc) {
							global.gc();
							console.log(`[GC] Limpeza de memória realizada após ${totalCards} registros`);
						}
					}
				} catch (cardErr) {
					console.warn(`[${idx + 1}] Erro ao processar card individual:`, cardErr?.message);
				}
			}
			if (options.validarTotalPorPagina && linksDaPagina.size !== totalDaPagina) {
				throw new Error(`[1000Imoveis] Faixa incompleta: ${linksDaPagina.size}/${totalDaPagina} links únicos.`);
			}

			// Limpar array de dados intermediários
			cardsData.length = 0;
			console.log(`[${idx + 1}] Total acumulado de cards: ${totalCards}`);

		} catch (err) {
			console.error(`[${idx + 1}] Erro ao processar o link. Pulando para o próximo...`);
			console.error(err?.message || err);
			if (options.validarTotalPorPagina) throw err;
		} finally {
			try {
				await page.close();
			} catch (e) {}
		}

		// Forçar coleta de lixo após cada página processada
		if (global.gc && (idx + 1) % 5 === 0) {
			global.gc();
		}
	}

	if (duplicados) console.warn(`[1000Imoveis] ${duplicados} card(s) repetido(s) pelo mesmo linkReal foram ignorados.`);
	let totalEsperado = options.totalEsperado;
	if (totalEsperado !== undefined && allImoveis.length !== totalEsperado && options.recontarTotal) {
		const totalAtual = await options.recontarTotal();
		console.warn(`[1000Imoveis] Coleta ${allImoveis.length}/${totalEsperado}; total recontado no site: ${totalAtual}.`);
		totalEsperado = totalAtual;
		allImoveis.totalConfirmado = totalAtual;
	}
	if (totalEsperado !== undefined && allImoveis.length !== totalEsperado) {
		if (options.linkSemFaixa) {
			console.warn(`[1000Imoveis] Faixas não cobriram a contagem global; tentando a listagem sem filtro de preço.`);
			const resultado = await extractMilImoveisData(browser, [options.linkSemFaixa], {
				negociacao: options.negociacao,
				paginacaoEndpoint: options.paginacaoEndpoint,
				totalEsperado,
				recontarTotal: options.recontarTotal,
			});
			if (resultado.totalConfirmado === undefined && allImoveis.totalConfirmado !== undefined) {
				resultado.totalConfirmado = allImoveis.totalConfirmado;
			}
			return resultado;
		}
		throw new Error(`[1000Imoveis] Coleta incompleta: ${allImoveis.length}/${totalEsperado}; detalhes nao serao visitados e base preservada.`);
	}
	console.log(`\n[FINAL] Total de cards raspados: ${allImoveis.length}`);
	return allImoveis;
}
