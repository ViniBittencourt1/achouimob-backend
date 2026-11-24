import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

import { extractCidadeFromCardHtml } from './extractor-07-cidade.js';
import { extractBairroFromCardHtml } from './extractor-06-bairrojs.js';
import { adicionarEnderecoNaLocalizacao, buildLocalizacaoFallback, extractEnderecoFromHtml } from './extractor-04-localizacao.js';
import { extractGaragemValor } from './extractor-12-garagemValor.js';
import { extractCodigoBase } from './extractor-14-codigoBase.js';
import { JSDOM } from 'jsdom';
import { extractLinkCard } from './extractor-15-linkCard.js';
import { extractLinkFoto } from './extractor-19-linkFoto.js';

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

function isRetryableNavigationError(error) {
	const msg = String(error?.message || error || '').toLowerCase();
	return (
		msg.includes('err_connection_refused') ||
		msg.includes('err_connection_reset') ||
		msg.includes('err_timed_out') ||
		msg.includes('navigation timeout') ||
		msg.includes('net::')
	);
}

// Visita o link interno de cada imóvel e extrai garagemValor
export async function enrichImoveisWithInternalData(browser, imoveis) {
	for (const imovel of imoveis) {
		if (!imovel.linkReal) continue;
		let page;
		try {
			page = await browser.newPage();

			const maxRetries = 3;
			let lastError = null;
			for (let attempt = 1; attempt <= maxRetries; attempt++) {
				try {
					await page.goto(imovel.linkReal, { waitUntil: 'domcontentloaded', timeout: 45000 });
					lastError = null;
					break;
				} catch (err) {
					lastError = err;
					const retryable = isRetryableNavigationError(err);
					if (!retryable || attempt === maxRetries) break;
					console.warn(`[acervo] [enrichImoveisWithInternalData] Falha de conexao (${attempt}/${maxRetries}) em ${imovel.linkReal}: ${err.message}`);
					await new Promise((resolve) => setTimeout(resolve, 2000));
				}
			}

			if (lastError) throw lastError;

			await new Promise(resolve => setTimeout(resolve, 1500));
			const html = await page.content();
			const endereco = extractEnderecoFromHtml(html);
			if (endereco) {
				imovel.localizacao = adicionarEnderecoNaLocalizacao(imovel.localizacao, endereco);
			}

			const bairro = extractBairroFromCardHtml(html, imovel.cidade, imovel.linkReal);
			if (bairro) imovel.bairro = bairro;

			const cidade = extractCidadeFromCardHtml(html, imovel.linkReal);
			if (cidade) imovel.cidade = cidade;

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

			// Extração da foto principal (mantém a da listagem se a interna não encontrar)
			const linkFoto = extractLinkFoto(html);
			if (linkFoto) imovel.linkFoto = linkFoto;
		} catch (e) {
			console.error(`[acervo] [enrichImoveisWithInternalData] Erro ao visitar ${imovel.linkReal}:`, e);
		} finally {
			if (page) {
				try {
					await page.close();
				} catch {}
			}
		}
	}
	return imoveis;
}
