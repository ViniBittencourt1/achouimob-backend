import { extractCidadeFromCardHtml } from './extractor-07-cidade.js';
import { extractLinkReal } from './extractor-01-linkReal.js';
import { extractTitulo } from './extractor-02-titulo.js';
import { extractPreco } from './extractor-03-preco.js';
import { extractLocalizacao, buildLocalizacaoFallback } from './extractor-04-localizacao.js';
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

export async function extractBomClimaData(browser, linksBusca, options = {}) {
	let allImoveis = [];
	let totalCards = 0;
	for (const [idx, link] of linksBusca.entries()) {
		console.log(`\n[${idx + 1}/${linksBusca.length}] Acessando: ${link}`);
		const page = await browser.newPage();
		await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
		await page.setViewport({ width: 1280, height: 800 });
		if (options.negociacao === 'locacao') await page.setCacheEnabled(false);
		const response = await page.goto(link, { waitUntil: 'networkidle2', timeout: 90000 });
		if (options.negociacao === 'locacao' && !response?.ok()) throw new Error(`HTTP ${response?.status()} na busca Bom Clima.`);
		console.log(`[${idx + 1}] Navegação concluída para: ${link}`);
		// Clicar LGPD se aparecer
		try {
			await page.waitForSelector('lgpd-close', { timeout: 5000 });
			await page.evaluate(() => {
				const btn = document.querySelector('lgpd-close');
				if (btn && /prosseguir|ok/i.test(btn.textContent)) btn.click();
			});
			await new Promise(resolve => setTimeout(resolve, 500));
		} catch (e) {}
		console.log(`[${idx + 1}] Iniciando loop de paginação...`);
		let paginacaoClicks = 0;
		while (true) {
			if (paginacaoClicks >= 50) {
				console.log(`[${idx + 1}] Limite de 50 cliques de paginação atingido. Pulando para o próximo processo de extração.`);
				break;
			}
			const btn = await page.$('button.more-results--button');
			if (!btn) break;
			await btn.click();
			paginacaoClicks++;
			console.log(`[${idx + 1}] Clique de paginação #${paginacaoClicks}`);
			await new Promise(resolve => setTimeout(resolve, 3500)); // tempo extra para garantir carregamento
		}
		console.log(`[${idx + 1}] Fim do loop de paginação. Iniciando busca dos cards...`);
		// Rolagem automática até o final da página para carregar todos os cards
		let previousHeight = 0;
		let reachedEnd = false;
		while (!reachedEnd) {
			const currentHeight = await page.evaluate('document.body.scrollHeight');
			await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
			await new Promise(resolve => setTimeout(resolve, 1200));
			const newHeight = await page.evaluate('document.body.scrollHeight');
			if (newHeight === previousHeight) {
				reachedEnd = true;
			} else {
				previousHeight = newHeight;
			}
		}

				// Espera explícita pelo carregamento de pelo menos uma imagem
				try {
					await page.waitForSelector('img', { timeout: 7000 });
				} catch (e) {
					console.warn('[extractBomClimaData] Nenhuma imagem carregada após 7s, prosseguindo mesmo assim.');
				}
				// Raspagem dos cards usando o novo seletor
				const cards = await page.$$(options.negociacao === 'locacao' ? 'a[href*="/imovel/"][href*="/locacao/"]' : 'div.ImovelCard_card__2FVbS');
		if (options.negociacao === 'locacao') {
			const total = await page.evaluate(() => {
				const match = document.querySelector('h1')?.textContent.match(/(\d+)\s+Im[o\u00f3]veis para alugar/i);
				return match ? Number(match[1]) : null;
			});
			if (!Number.isInteger(total) || cards.length !== total) throw new Error('Quantidade de alugueis Bom Clima difere do total informado. Coleta parcial nao sera publicada.');
		}
		console.log(`[${idx + 1}] Cards encontrados: ${cards.length}`);
		if (cards.length === 0) {
			await page.close();
			continue;
		}
		for (const card of cards) {
			const html = await page.evaluate(el => el.outerHTML, card);
			const titulo = await extractTitulo(html, { incluirTaxas: options.incluirTaxas });
			const linkReal = await extractLinkReal(html);
			const cidade = extractCidadeFromCardHtml(html);
					const bairro = await extractBairro(html, cidade, linkReal);
			const localizacao = await extractLocalizacao(html) || buildLocalizacaoFallback(bairro, cidade);
			const imovel = {
				linkReal,
				titulo,
				preco: await extractPreco(html, options.negociacao),
				localizacao,
				tipoImovel: await extractTipoImovel(html),
				bairro,
				cidade,
				dormitorioValor: await extractDormitorioValor(html),
				banheiroValor: await extractBanheiroValor(html),
				ambienteValor: await extractAmbienteValor(html),
				areaValor: await extractAreaValor(html),
				// garagemValor e codigoBase serão preenchidos pela rota interna
				elevadorValor: await extractElevadorValor(html),
				linkCard: await extractLinkCard(html),
				corretor: await extractCorretor(html),
				dataInclusao: await extractDataInclusao(html),
				// dataExclusao será preenchido apenas no parser/consolidador
				// linkFoto será preenchido apenas na rota interna
				atualizadoEm: await extractAtualizadoEm(html)
			};
			if (options.negociacao === 'locacao') {
				imovel.garagemValor = await extractGaragemValor(html);
				imovel.codigoBase = await extractCodigoBase(html) || new URL(linkReal).pathname.split('/').filter(Boolean).at(-1);
				imovel.linkFoto = await extractLinkFoto(html);
			}
			allImoveis.push(imovel);
			totalCards++;
		}
		console.log(`[${idx + 1}] Total acumulado de cards: ${totalCards}`);
		await page.close();
	}
	console.log(`\n[FINAL] Total de cards raspados: ${allImoveis.length}`);
	return allImoveis;
}
