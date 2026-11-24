import { coletarPaginasKenloVendas, readSnapshotLeal } from '../_utils/vendasKenloPaginacao.js';
import { extractCidadeFromCardHtml } from './extractor-07-cidade.js';
import { extractLinkReal } from './extractor-01-linkReal.js';
import { extractTitulo } from './extractor-02-titulo.js';
import { extractPreco } from './extractor-03-preco.js';
import { extractLocalizacao } from './extractor-04-localizacao.js';
import { extractTipoImovel } from './extractor-05-tipoImovel.js';
import { extractBairro, extractBairroFromBreadcrumb } from './extractor-06-bairrojs.js';
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





export async function extractLocalData(browser, linksBusca, options = {}) {
	const allImoveis = [];
	const cards = await coletarPaginasKenloVendas(browser, linksBusca, { maxTentativas: 2, ...options, projeto: 'jfLeal', readSnapshot: readSnapshotLeal, cardSelector: '.card.card-listing,a.card-with-buttons.borderHover' });
	console.log(`[jfLeal] Paginacao concluida. Extraindo campos de ${cards.length} cards.`);
	for (const card of cards) {
			const html = card;
			const linkReal = await extractLinkReal(html);
			const titulo = await extractTitulo(html);
			const cidade = extractCidadeFromCardHtml(html);
			const bairro = await extractBairro(html, cidade);
			const localizacao = extractLocalizacao(html);
			const imovel = {
				linkReal,
				titulo,
				preco: await extractPreco(html),
				tipoImovel: await extractTipoImovel(html),
				bairro,
				cidade,
				localizacao,
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
			if (allImoveis.length % 25 === 0 || allImoveis.length === cards.length) {
				console.log(`[jfLeal] Campos extraidos: ${allImoveis.length}/${cards.length} cards.`);
			}
			if (global.gc && allImoveis.length % 20 === 0) global.gc();
		}
	const semBairro = allImoveis.filter(imovel => !imovel.bairro && imovel.linkReal && imovel.cidade);
	let bairrosResolvidosPorBreadcrumb = 0;
	if (semBairro.length) console.log(`[jfLeal] Consultando breadcrumb de ${semBairro.length} imoveis sem bairro (timeout de navegacao: 45s).`);
	for (const [index, imovel] of semBairro.entries()) {
		console.log(`[jfLeal] Breadcrumb ${index + 1}/${semBairro.length}: ${imovel.codigoBase} - ${imovel.linkReal}`);
		const page = await browser.newPage();
		try {
			const response = await page.goto(imovel.linkReal, { waitUntil: 'domcontentloaded', timeout: 45000 });
			if (!response?.ok()) {
				console.warn(`[jfLeal] Breadcrumb ${imovel.codigoBase}: HTTP ${response?.status() ?? 'sem resposta'}; bairro pendente.`);
				continue;
			}
			const html = await page.content();
			const bairro = extractBairroFromBreadcrumb(html, imovel.cidade);
			if (bairro) {
				imovel.bairro = bairro;
				bairrosResolvidosPorBreadcrumb++;
			}
		} catch (error) {
			console.warn(`[jfLeal] Nao foi possivel obter breadcrumb de ${imovel.codigoBase}: ${error?.message || error}`);
		} finally {
			await page.close();
			console.log(`[jfLeal] Breadcrumbs consultados: ${index + 1}/${semBairro.length}; bairros resolvidos: ${bairrosResolvidosPorBreadcrumb}.`);
		}
	}
	if (semBairro.length) console.log(`[jfLeal] Bairros resolvidos pelo breadcrumb: ${bairrosResolvidosPorBreadcrumb}/${semBairro.length}.`);
	console.log(`[FINAL] Total de cards raspados: ${allImoveis.length}`);
	return allImoveis;
}
