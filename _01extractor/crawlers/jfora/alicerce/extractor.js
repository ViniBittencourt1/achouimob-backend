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
import { coletarFaixasAlicerce } from './faixasPreco.js';

export async function paginarAlicerce(page, onClick = () => {}) {
	for (let clicks = 0; ; clicks++) {
		await page.waitForFunction(() => {
			const button = document.querySelector('button.more-results--button');
			return !button || (!button.disabled && !button.classList.contains('inside-loading'));
		}, { timeout: 60000 });
		const state = await page.evaluate(limit => {
			const button = document.querySelector('button.more-results--button');
			const count = document.querySelectorAll('#imoveis--listing--items .imovel-item').length;
			if (!button) return { clicked: false, count };
			if (limit) throw new Error('Limite de paginacao Alicerce atingido; base preservada.');
			if (button.disabled || button.classList.contains('inside-loading')) throw new Error('Botao de paginacao Alicerce ainda ocupado; base preservada.');
			button.click();
			return { clicked: true, count };
		}, clicks >= 150);
		if (!state.clicked) return;
		onClick(clicks + 1);
		await page.waitForFunction(previousCount => {
			const button = document.querySelector('button.more-results--button');
			return document.querySelectorAll('#imoveis--listing--items .imovel-item').length > previousCount
				&& (!button || (!button.disabled && !button.classList.contains('inside-loading')));
		}, { timeout: 60000 }, state.count);
	}
}

export async function contarFaixaAlicerce(browser, link) {
	const page = await browser.newPage();
	try {
		const response = await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 90000 });
		if (!response?.ok()) throw new Error(`[Alicerce] HTTP ${response?.status()} na contagem da faixa; base preservada.`);
		const expected = new URL(link);
		const actual = new URL(page.url());
		if (actual.origin !== expected.origin || actual.pathname !== expected.pathname
			|| [...expected.searchParams].some(([key, value]) => actual.searchParams.get(key) !== value)) {
			throw new Error('[Alicerce] Busca redirecionada fora dos filtros; base preservada.');
		}
		const label = await page.$eval('#title--label', element => element.textContent);
		const match = label.replace(/\s|\u00a0/g, '').match(/^Imóveis\((\d+)\)$/i);
		const total = match ? Number(match[1]) : NaN;
		if (!Number.isSafeInteger(total) || total < 0) throw new Error('[Alicerce] Total da faixa nao identificado; base preservada.');
		return total;
	} finally { await page.close(); }
}

export async function extractAlicerceData(browser, linksBusca, options = {}) {
	const records = new Map();
	for (const link of linksBusca) {
		const rows = await coletarFaixasAlicerce({
			url: link, totalEsperado: linksBusca.length === 1 ? options.totalEsperado : undefined,
			contar: url => contarFaixaAlicerce(browser, url),
			coletar: (url, total) => extractListagemAlicerce(browser, [url], { ...options, totalEsperado: total }),
		});
		for (const row of rows) records.set(row.linkReal, row);
	}
	if (options.totalEsperado !== undefined && records.size !== options.totalEsperado) {
		throw new Error(`[Alicerce] Coleta incompleta: ${records.size}/${options.totalEsperado}; detalhes nao serao visitados e base preservada.`);
	}
	return [...records.values()];
}

export async function extractListagemAlicerce(browser, linksBusca, options = {}) {
	let allImoveis = [];
	let totalCards = 0;
	for (const [idx, link] of linksBusca.entries()) {
		console.log(`\n[${idx + 1}/${linksBusca.length}] Acessando: ${link}`);
		const page = await browser.newPage();
		try {
			await page.setRequestInterception(true);
			page.on('request', request => {
				// Os URLs das fotos vem do HTML; baixar midias sobrecarrega a listagem acumulada.
				if (['image', 'media', 'font'].includes(request.resourceType())) return request.abort();
				return request.continue();
			});
			await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
			await page.setViewport({ width: 1280, height: 800 });
			await page.goto(link, { waitUntil: 'networkidle2', timeout: 90000 });
			console.log(`[${idx + 1}] Navegação concluída para: ${link}`);
			await page.evaluate(() => {
				const btn = document.querySelector('lgpd-close');
				if (btn && /prosseguir|ok/i.test(btn.textContent)) btn.click();
			});
			console.log(`[${idx + 1}] Iniciando loop de paginação...`);
			await paginarAlicerce(page, clicks => console.log(`[${idx + 1}] Clique de paginação #${clicks}`));
			console.log(`[${idx + 1}] Fim do loop de paginação. Iniciando busca dos cards...`);
			// Raspagem dos cards
			const cards = await page.$$eval('#imoveis--listing--items .imovel-item', elements => elements.map(el => el.outerHTML));
			console.log(`[${idx + 1}] Cards encontrados: ${cards.length}`);
			if (cards.length === 0) {
				continue;
			}
			for (const html of cards) {
				const titulo = await extractTitulo(html);
				const linkReal = await extractLinkReal(html);
				const cidade = extractCidadeFromCardHtml(html, linkReal);
				const imovel = {
					linkReal,
					titulo,
					preco: await extractPreco(html, options.negociacao),
					localizacao: await extractLocalizacao(html),
					tipoImovel: await extractTipoImovel(html),
					bairro: await extractBairro(html, cidade),
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
			}
			console.log(`[${idx + 1}] Total acumulado de cards: ${totalCards}`);
		} finally {
			await page.close();
		}
	}
	if (options.totalEsperado !== undefined && allImoveis.length !== options.totalEsperado) {
		throw new Error(`[Alicerce] Coleta incompleta: ${allImoveis.length}/${options.totalEsperado}; detalhes nao serao visitados e base preservada.`);
	}
	console.log(`\n[FINAL] Total de cards raspados: ${allImoveis.length}`);
	return allImoveis;
}
