import { coletarPaginasKenloVendas } from '../_utils/vendasKenloPaginacao.js';
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

export async function loadCardsLocacaoEstrelaSul(page) {
	const total = await page.evaluate(() => {
		const match = document.querySelector('h1')?.textContent.match(/Exibindo\s+(\d+)\s+Im[o\u00f3]veis/i);
		return match ? Number(match[1]) : null;
	});
	if (!Number.isInteger(total) || total < 0) throw new Error('Total de alugueis Estrela Sul nao identificado.');
	let count = await page.$$eval('a.card-with-buttons.borderHover', cards => cards.length);
	let clicks = 0;
	while (count < total) {
		if (clicks >= 100) throw new Error('Limite de paginacao Estrela Sul atingido. Coleta parcial preservada sem publicacao.');
		const handle = await page.evaluateHandle(() => Array.from(document.querySelectorAll('a.btn-next,button.btn-next')).find(item => /^Ver mais$/i.test(item.textContent.trim()) && !item.disabled && item.getAttribute('aria-disabled') !== 'true') || null);
		try {
			const button = handle.asElement();
			if (!button) throw new Error('Ver mais ausente antes de atingir o total de alugueis.');
			await button.click();
			await page.waitForFunction(before => document.querySelectorAll('a.card-with-buttons.borderHover').length > before, { timeout: 20000 }, count);
			count = await page.$$eval('a.card-with-buttons.borderHover', cards => cards.length);
			clicks++;
		} finally { await handle.dispose(); }
	}
	if (count !== total) throw new Error('Quantidade de cards difere do total de alugueis informado.');
	console.log(`[EstrelaSulLocacao] ${count}/${total} cards carregados (${clicks} cliques).`);
	return total;
}

export async function extractEstrelaSulData(browser, linksBusca, options = {}) {
	if (options.negociacao !== 'locacao') return extractEstrelaSulVendas(browser, linksBusca, options);
	let allImoveis = [];
	let totalCards = 0;
	for (const [idx, link] of linksBusca.entries()) {
		console.log(`\n[${idx + 1}/${linksBusca.length}] Acessando: ${link}`);
		const page = await browser.newPage();
		await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
		await page.setViewport({ width: 1280, height: 800 });
		const response = await page.goto(link, { waitUntil: 'networkidle2', timeout: 90000 });
		if (options.negociacao === 'locacao' && !response?.ok()) throw new Error(`HTTP ${response?.status()} na busca Estrela Sul.`);
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
		if (options.negociacao === 'locacao') {
			await loadCardsLocacaoEstrelaSul(page);
		} else while (true) {
			try {
				await page.waitForSelector('button.btn-next span', { timeout: 5000 });
			} catch (e) {
				break; // botão não existe mais
			}
			const btn = await page.$('button.btn-next span');
			if (!btn) break;
			await page.evaluate(span => span.parentElement.click(), btn);
			paginacaoClicks++;
			console.log(`[${idx + 1}] Clique de paginação #${paginacaoClicks}`);
			await new Promise(resolve => setTimeout(resolve, 3500));
		}
		console.log(`[${idx + 1}] Fim do loop de paginação. Iniciando busca dos cards...`);
		// Raspagem dos cards: <a class="card-with-buttons borderHover">
		const cards = await page.$$('a.card-with-buttons.borderHover');
		console.log(`[${idx + 1}] Cards encontrados: ${cards.length}`);
		if (cards.length === 0) {
			await page.close();
			continue;
		}
		for (const card of cards) {
			const html = await page.evaluate(el => el.outerHTML, card);
			const titulo = await extractTitulo(html);
			const cidade = extractCidadeFromCardHtml(html);
			const imovel = {
				linkReal: await extractLinkReal(html),
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
		await page.close();
	}
	console.log(`\n[FINAL] Total de cards raspados: ${allImoveis.length}`);
	return allImoveis;
}

export function readSnapshotEstrelaSulVendas() {
	const cards = new Map();
	for (const anchor of document.querySelectorAll('a.card-with-buttons.borderHover[href]')) {
		const url = new URL(anchor.href);
		if (url.origin !== new URL(document.URL).origin || !/^\/(?:imovel|empreendimento)\//.test(url.pathname)) continue;
		url.search = '';
		url.hash = '';
		cards.set(url.href, { href: url.href, html: anchor.outerHTML });
	}
	const next = Array.from(document.querySelectorAll('a.btn-next[href]')).find(anchor => /ver\s+mais/i.test(anchor.textContent) && !anchor.getAttribute('data-action') && anchor.getAttribute('aria-disabled') !== 'true');
	return { heading: document.querySelector('h1')?.textContent || '', cards: [...cards.values()], next: next?.href || '' };
}

export async function extractEstrelaSulVendas(browser, linksBusca, options = {}) {
	const allImoveis = [];
	const cards = await coletarPaginasKenloVendas(browser, linksBusca, { ...options, projeto: 'jfEstrelaSul', readSnapshot: readSnapshotEstrelaSulVendas, cardSelector: 'a.card-with-buttons.borderHover' });
	for (const card of cards) {
			const html = card;
			const titulo = await extractTitulo(html);
			const cidade = extractCidadeFromCardHtml(html);
			const imovel = {
				linkReal: await extractLinkReal(html),
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
			if (global.gc && allImoveis.length % 20 === 0) global.gc();
		}
	console.log(`[FINAL] Total de cards raspados: ${allImoveis.length}`);
	return allImoveis;
}
