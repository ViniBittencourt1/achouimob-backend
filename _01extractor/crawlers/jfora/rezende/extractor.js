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

export async function extractRezendeData(browser, linksBusca, options = {}) {
	let allImoveis = [];
	let totalCards = 0;
	const MAX_TENTATIVAS_NAV = 3;
	const ESPERA_ENTRE_TENTATIVAS_MS = 4000;
	const MAX_PAGINACAO_CLICKS = 80;
	const MAX_TENTATIVAS_SEM_NOVOS_CARDS = 3;
	for (const [idx, link] of linksBusca.entries()) {
		console.log(`\n[${idx + 1}/${linksBusca.length}] Acessando: ${link}`);
		let page;
		try {
			page = await browser.newPage();
			await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
			await page.setViewport({ width: 1280, height: 800 });

			let navegacaoOk = false;
			let response;
			for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_NAV; tentativa++) {
				try {
					response = await page.goto(link, { waitUntil: 'networkidle2', timeout: 90000 });
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
			let tentativasSemNovosCards = 0;
			let totalCardsAnterior = await page.$$eval('.imovel-item.imovel-item-show', cards => cards.length);
			if (options.totalEsperado === undefined) {
				while (true) {
					if (paginacaoClicks >= MAX_PAGINACAO_CLICKS) {
						console.warn(`[${idx + 1}] Paginação interrompida após ${MAX_PAGINACAO_CLICKS} cliques (trava de segurança).`);
						break;
					}

					const btn = await page.$('button.more-results--button');
					if (!btn) break;

					const botaoInativo = await page.evaluate(el => {
						const ariaDisabled = el.getAttribute('aria-disabled') === 'true';
						const classDisabled = el.classList.contains('disabled');
						const invisivel = el.offsetParent === null;
						return el.disabled || ariaDisabled || classDisabled || invisivel;
					}, btn);
					if (botaoInativo) {
						console.log(`[${idx + 1}] Botão de paginação indisponível. Encerrando paginação.`);
						break;
					}

					await btn.click();
					paginacaoClicks++;
					console.log(`[${idx + 1}] Clique de paginação #${paginacaoClicks}`);
					await new Promise(resolve => setTimeout(resolve, 3500)); // tempo extra para garantir carregamento

					const totalCardsAtual = await page.$$eval('.imovel-item.imovel-item-show', cards => cards.length);
					if (totalCardsAtual <= totalCardsAnterior) {
						tentativasSemNovosCards++;
						console.warn(`[${idx + 1}] Paginação sem novos cards (${tentativasSemNovosCards}/${MAX_TENTATIVAS_SEM_NOVOS_CARDS}).`);
						if (tentativasSemNovosCards >= MAX_TENTATIVAS_SEM_NOVOS_CARDS) {
							console.warn(`[${idx + 1}] Paginação encerrada por estagnação de cards.`);
							break;
						}
						continue;
					}

					totalCardsAnterior = totalCardsAtual;
					tentativasSemNovosCards = 0;
				}
			}
			console.log(`[${idx + 1}] Fim do loop de paginação. Iniciando busca dos cards...`);
			// Raspagem dos cards
			const cards = options.totalEsperado !== undefined ? await coletarVendasPadrao(page, link, options.totalEsperado) : await page.$$('.imovel-item.imovel-item-show');
			console.log(`[${idx + 1}] Cards encontrados: ${cards.length}`);
			if (cards.length === 0) {
				if (options.negociacao === 'locacao' && response?.ok() && typeof options.onEmptyConfirmed === 'function') {
					const confirmado = await page.evaluate(() =>
						/O filtro n[a\u00e3]o retornou nenhum im[o\u00f3]vel/i.test(document.body.innerText || '')
					);
					if (confirmado) options.onEmptyConfirmed();
				}
				continue;
			}
			for (const card of cards) {
				const html = typeof card === 'string' ? card : await page.evaluate(el => el.outerHTML, card);
				const titulo = await extractTitulo(html);
				const linkReal = await extractLinkReal(html);
				const cidade = extractCidadeFromCardHtml(html);
				const imovel = {
					linkReal,
					titulo,
						preco: await extractPreco(html, options.negociacao),
					localizacao: await extractLocalizacao(html),
					tipoImovel: await extractTipoImovel(html),
					bairro: await extractBairro(html, cidade, linkReal),
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
				if (options.totalEsperado !== undefined && totalCards % 20 === 0) await new Promise(resolve => setImmediate(resolve));
			}
			console.log(`[${idx + 1}] Total acumulado de cards: ${totalCards}`);
		} catch (err) {
			console.error(`[${idx + 1}] Erro ao processar o link. Pulando para o próximo...`);
			console.error(err?.message || err);
		} finally {
			try {
				if (!page) continue;
				await page.close();
			} catch (e) {}
		}
	}
	console.log(`\n[FINAL] Total de cards raspados: ${allImoveis.length}`);
	if (options.totalEsperado !== undefined && allImoveis.length !== options.totalEsperado) throw new Error(`Coleta incompleta: ${allImoveis.length}/${options.totalEsperado}; detalhes nao serao visitados e base preservada.`);
	return allImoveis;
}
