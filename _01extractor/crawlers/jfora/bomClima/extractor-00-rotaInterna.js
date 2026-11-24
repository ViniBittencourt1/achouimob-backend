import { fileURLToPath } from 'url';
import path from 'path';

import { extractCidadeFromCardHtml } from './extractor-07-cidade.js';
import { extractBairroFromCardHtml } from './extractor-06-bairrojs.js';
import { buildLocalizacaoFallback } from './extractor-04-localizacao.js';
import { extractGaragemValor } from './extractor-12-garagemValor.js';
import { extractCodigoBase } from './extractor-14-codigoBase.js';
import { JSDOM } from 'jsdom';
import { extractLinkFoto } from './extractor-19-linkFoto.js';
import { extractLinkCard } from './extractor-15-linkCard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const bairrosPath = path.resolve(__dirname, '../../../../crawler/_jfBairros.json');
let bairrosList = [];
try {
	bairrosList = JSON.parse(fs.readFileSync(bairrosPath, 'utf8'));
} catch (e) {
	bairrosList = [];
}

function capitalizeWords(str) {
	return String(str)
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.replace(/-/g, ' ')
		.split(' ')
		.map(word => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

// Visita o link interno de cada imóvel e extrai garagemValor
export async function enrichImoveisWithInternalData(browser, imoveis, options = {}) {
	for (const imovel of imoveis) {
		if (!imovel.linkReal) continue;
		try {
			const page = await browser.newPage();
			await page.goto(imovel.linkReal, { waitUntil: 'networkidle0', timeout: 60000 });
			await new Promise(resolve => setTimeout(resolve, 1500));
			const html = await page.content();
					const cidade = extractCidadeFromCardHtml(html);
					if (cidade) imovel.cidade = cidade;

					const bairro = extractBairroFromCardHtml(html, imovel.cidade || '', imovel.linkReal);
					if (bairro) imovel.bairro = bairro;

			if (!String(imovel.localizacao || '').trim()) {
				imovel.localizacao = buildLocalizacaoFallback(imovel.bairro, imovel.cidade);
			}

			// ...extração da cidade já feita acima com log...

			// Extração do valor de garagem
			const garagemValor = extractGaragemValor(html);
			if (garagemValor !== undefined && garagemValor !== null) imovel.garagemValor = garagemValor;

			// Extração do código base
			const codigoBase = extractCodigoBase(html);
			if (codigoBase) imovel.codigoBase = codigoBase;

			// Extração do linkCard usando o HTML da rota interna
			const linkCard = extractLinkCard(html);
			if (linkCard) imovel.linkCard = linkCard;
						// Extração da foto usando extractor-19-linkFoto.js
						const linkFoto = extractLinkFoto(html);
						if (linkFoto && (!options.preservarFotoListagem || !imovel.linkFoto)) {
							imovel.linkFoto = linkFoto;
							console.log(`[rotaInterna][linkFoto]`, linkFoto);
						}
						await page.close();
		} catch (e) {
			console.error(`[enrichImoveisWithInternalData] Erro ao visitar ${imovel.linkReal}:`, e);
		}
	}
	return imoveis;
}
