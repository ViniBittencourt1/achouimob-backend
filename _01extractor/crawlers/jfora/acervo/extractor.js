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

async function carregarComplementoApiAcervo(page, registros, totalEsperado) {
	const codigosConhecidos = registros.map(item => item.codigoBase).filter(Boolean);
	const resultado = await page.evaluate(async ({ codigos, total }) => {
		const pageProps = JSON.parse(document.querySelector('#__NEXT_DATA__')?.textContent || '{}').props?.pageProps;
	if (!pageProps || Number(pageProps.count) !== total || pageProps.locations?.length !== total) {
			throw new Error('[Acervo] Contador/IDs da API divergentes; base preservada.');
		}
		const known = new Set(codigos);
		const missing = pageProps.locations.filter(item => item.imv_cod_gaia && !known.has(item.imv_cod_gaia));
		if (!missing.length) return { missing: [], records: [] };
		const params = new URLSearchParams({
			where: JSON.stringify({ id: { inq: missing.map(item => item.id) } }),
			order: pageProps.request_filters?.order || 'mais_relevantes',
			tipovar: pageProps.request_filters?.tipovar || 'a-venda',
			center: JSON.stringify(pageProps.geometry?.location || {}),
		});
		const response = await fetch(`https://api-site.arboimoveis.com.br/api/imoveis-replica/get-imoveis-new?${params}`, {
			headers: { From: 'NEXT', 'Content-Type': 'application/json' },
		});
		if (!response.ok) throw new Error(`[Acervo] API complementar HTTP ${response.status}; base preservada.`);
		return { missing, records: await response.json() };
	}, { codigos: codigosConhecidos, total: totalEsperado });

	const expectedCodes = new Set(resultado.missing.map(item => item.imv_cod_gaia));
	if (!Array.isArray(resultado.records) || resultado.records.length !== expectedCodes.size ||
		new Set(resultado.records.map(item => item.imv_cod_gaia)).size !== resultado.records.length ||
		resultado.records.some(item => !expectedCodes.has(item.imv_cod_gaia) || !item.url_amiga)) {
		throw new Error('[Acervo] API nao retornou todos os anuncios faltantes de forma unica; base preservada.');
	}

	return resultado.records.map(item => {
		const linkReal = item.url_amiga;
		const cidade = extractCidadeFromCardHtml('', linkReal);
		const bairro = extractBairro('', cidade, linkReal);
		const typeName = String(item.tipo_imovel?.timv_nome || '');
		const tipoImovel = /box\s*\/\s*garagem/i.test(typeName)
			? 'garagem'
			: extractTipoImovel(`<span class="ImovelCardInfo_colorOfTypePropertie__OWVB6">${typeName}</span>`);
		const localizacaoBase = buildLocalizacaoFallback(bairro, cidade);
		const enderecoVisivel = item.imv_hide_address_wl || item.imobiliaria?.imb_hidden_address
			? ''
			: [item.imv_endereco, Number(item.imv_end_numero) ? item.imv_end_numero : ''].filter(Boolean).join(', ');
		const preco = item.imv_ocultar_preco ? null : Number(item.imv_preco_venda);
		return {
			linkReal,
			titulo: item.imv_titulo || '',
			preco: Number.isFinite(preco) ? preco : null,
			localizacao: [localizacaoBase, enderecoVisivel].filter(Boolean).join(' - '),
			tipoImovel,
			bairro,
			cidade,
			dormitorioValor: Number(item.imv_qtd_dorm) || 0,
			banheiroValor: Number(item.imv_qtd_banheiros) || 0,
			ambienteValor: 0,
			areaValor: String(Number(item.imv_area_util) || 0),
			garagemValor: Number(item.imv_qtd_vagas) || 0,
			elevadorValor: 0,
			codigoBase: item.imv_cod_gaia,
			linkCard: linkReal,
			corretor: 'Acervo',
			dataInclusao: new Date().toISOString(),
			dataExclusao: '',
			linkFoto: item.fotos?.[0]?.imvft_url || '',
			atualizadoEm: item.updatedAt || new Date().toISOString(),
		};
	});
}

export async function extractAcervoData(browser, linksBusca, options = {}) {
	let allImoveis = [];
	let totalCards = 0;
	for (const [idx, link] of linksBusca.entries()) {
		console.log(`\n[${idx + 1}/${linksBusca.length}] Acessando: ${link}`);
		const page = await browser.newPage();
		await page.browserContext().overridePermissions(new URL(link).origin, []);
		await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
		await page.setViewport({ width: 1280, height: 800 });
		await page.goto(link, { waitUntil: 'networkidle2', timeout: 90000 });
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
		const negociacao = options.negociacao ?? 'venda';
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
		if (Number.isInteger(options.totalEsperado)) {
			const rotaPermitida = negociacao === 'locacao' ? '/locacao/' : '/venda/juiz-de-fora/';
			const contarLinksUnicos = () => page.$$eval('a[href*="/imovel/"]', (links, route) => new Set(
				links.map(link => link.getAttribute('href')).filter(href => href?.includes(route))
			).size, rotaPermitida);
			let carregados = await contarLinksUnicos();
			while (carregados < options.totalEsperado) {
				await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
				await page.waitForFunction((previousCount, route) => {
					const links = Array.from(document.querySelectorAll('a[href*="/imovel/"]'))
						.map(link => link.getAttribute('href'))
						.filter(href => href?.includes(route));
					return new Set(links).size > previousCount;
				}, { timeout: 20000 }, carregados, rotaPermitida).catch(() => {});
				const atualizados = await contarLinksUnicos();
				if (atualizados <= carregados) {
					console.warn(`[Acervo] Rolagem parou em ${carregados}/${options.totalEsperado}; consultando os IDs restantes na API oficial.`);
					break;
				}
				carregados = atualizados;
				console.log(`[Acervo] Links carregados: ${carregados}/${options.totalEsperado}.`);
			}
		} else {
			let previousHeight = 0;
			let reachedEnd = false;
			while (!reachedEnd) {
				const currentHeight = await page.evaluate('document.body.scrollHeight');
				await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
				await new Promise(resolve => setTimeout(resolve, 1200));
				const newHeight = await page.evaluate('document.body.scrollHeight');
				if (newHeight === previousHeight) reachedEnd = true;
				else previousHeight = newHeight;
			}
		}

				// Espera explícita pelo carregamento de pelo menos uma imagem
				try {
					await page.waitForSelector('img', { timeout: 7000 });
				} catch (e) {
					console.warn('[extractAcervoData] Nenhuma imagem carregada após 7s, prosseguindo mesmo assim.');
				}
			// Raspagem dos cards usando links de imóveis (seletor robusto para o novo site)
			const allLinks = await page.$$(`a[href*="/imovel/"][href*="/${negociacao}/"]`);
			const seenHrefs = new Set();
			const cards = [];
			for (const link of allLinks) {
				const href = await link.evaluate(el => el.getAttribute('href'));
				const rotaPermitida = negociacao === 'locacao' ? '/locacao/' : '/venda/juiz-de-fora/';
				if (href && href.includes(rotaPermitida) && !seenHrefs.has(href)) {
					seenHrefs.add(href);
					cards.push(link);
				}
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
			const cidade = extractCidadeFromCardHtml(html, linkReal);
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
				garagemValor: await extractGaragemValor(html),
				elevadorValor: await extractElevadorValor(html),
				codigoBase: await extractCodigoBase(html, linkReal),
				linkCard: await extractLinkCard(html),
				corretor: await extractCorretor(html),
				dataInclusao: await extractDataInclusao(html),
				linkFoto: extractLinkFoto(html),
				// dataExclusao será preenchido apenas no parser/consolidador
				atualizadoEm: await extractAtualizadoEm(html)
			};
			allImoveis.push(imovel);
			totalCards++;
		}
		if (Number.isInteger(options.totalEsperado) && idx === linksBusca.length - 1 && allImoveis.length < options.totalEsperado) {
			const faltantes = await carregarComplementoApiAcervo(page, allImoveis, options.totalEsperado);
			allImoveis.push(...faltantes);
			console.log(`[Acervo] Complemento da API oficial: ${faltantes.length} anuncios.`);
		}
		console.log(`[${idx + 1}] Total acumulado de cards: ${totalCards}`);
		await page.close();
	}
	console.log(`\n[FINAL] Total de cards raspados: ${allImoveis.length}`);
	if (Number.isInteger(options.totalEsperado) && allImoveis.length !== options.totalEsperado) {
		throw new Error(`[Acervo] Coleta incompleta: ${allImoveis.length}/${options.totalEsperado}; base preservada.`);
	}
	if (new Set(allImoveis.map(item => item.linkReal)).size !== allImoveis.length) {
		throw new Error('[Acervo] Links de anúncios duplicados; base preservada.');
	}
	return allImoveis;
}
