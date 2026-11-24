import axios from 'axios';
import { adicionarEnderecoNaLocalizacao, extractEnderecoFromHtml } from './extractor-04-localizacao.js';

const HTTP_CONFIG = {
	timeout: 30000,
	headers: {
		'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
		'Accept-Language': 'pt-BR,pt;q=0.9',
	},
};

async function carregarHtmlDetalhe(linkReal) {
	let ultimoErro;
	for (let tentativa = 1; tentativa <= 3; tentativa++) {
		try {
			const response = await axios.get(linkReal, HTTP_CONFIG);
			return response.data;
		} catch (error) {
			ultimoErro = error;
			if (tentativa < 3) await new Promise(resolve => setTimeout(resolve, 1000 * tentativa));
		}
	}
	throw ultimoErro;
}

export async function enrichImoveisWithInternalData(_browser, imoveis) {
	let enderecosEncontrados = 0;

	for (const imovel of imoveis) {
		if (!imovel.linkReal) continue;

		try {
			const endereco = extractEnderecoFromHtml(await carregarHtmlDetalhe(imovel.linkReal));
			if (endereco) {
				imovel.localizacao = adicionarEnderecoNaLocalizacao(imovel.localizacao, endereco);
				enderecosEncontrados++;
			}
		} catch (error) {
			console.error(`[1000Imoveis] Erro ao extrair endereço de ${imovel.linkReal}:`, error?.message || error);
		}
	}

	console.log(`[1000Imoveis] Endereços encontrados na rota interna: ${enderecosEncontrados}/${imoveis.length}.`);
	return imoveis;
}
