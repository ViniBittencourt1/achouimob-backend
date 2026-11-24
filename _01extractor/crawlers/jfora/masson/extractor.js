import { coletarPaginasKenloVendas, readSnapshotGm } from '../_utils/vendasKenloPaginacao.js';
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

export async function extractMassonData(browser, linksBusca, options = {}) {
	const allImoveis = [];
	const cards = await coletarPaginasKenloVendas(browser, linksBusca, {
		...options,
		projeto: 'jfMasson',
		readSnapshot: readSnapshotGm,
		cardSelector: 'a.card-with-buttons.borderHover',
		waitUntil: 'domcontentloaded',
		navigationTimeoutMs: 45000,
	});
	for (const card of cards) {
			const html = card;
			const titulo = await extractTitulo(html);
			const cidade = extractCidadeFromCardHtml(html);
			const imovel = {
				linkReal: await extractLinkReal(html),
				titulo,
				preco: await extractPreco(html),
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
			if (allImoveis.length % 20 === 0) {
				console.log(`[jfMasson] Processados ${allImoveis.length}/${cards.length} cards.`);
				if (global.gc) global.gc();
				await new Promise(resolve => setImmediate(resolve));
			}
		}
	console.log(`[FINAL] Total de cards raspados: ${allImoveis.length}`);
	return allImoveis;
}
