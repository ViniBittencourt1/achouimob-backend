import { extractTitulo } from './extractor-02-titulo.js';
import { extractBairro } from './extractor-06-bairrojs.js';
import { buildLocalizacaoFallback } from './extractor-04-localizacao.js';
import { extractTipoImovel } from './extractor-05-tipoImovel.js';

export async function enrichImoveisWithInternalData(browser, imoveis) {
	for (const imovel of imoveis) {
		if (!imovel?.linkReal || (String(imovel.titulo || '').trim() && String(imovel.bairro || '').trim() && String(imovel.localizacao || '').trim() && String(imovel.tipoImovel || '').trim())) continue;

		let page;
		try {
			page = await browser.newPage();
			await page.goto(imovel.linkReal, { waitUntil: 'networkidle2', timeout: 60000 });
			await page.waitForSelector('.cont-title h1, .cont-title h2, h1, h2', { timeout: 20000 }).catch(() => {});
			const html = await page.content();
			const titulo = extractTitulo(html);
			if (titulo) {
				imovel.titulo = titulo;
			}
			const bairro = extractBairro(html, imovel.titulo, imovel.cidade);
			if (bairro) {
				imovel.bairro = bairro;
			}
			const tipoImovel = extractTipoImovel(html, imovel.linkReal);
			if (tipoImovel) {
				imovel.tipoImovel = tipoImovel;
			}
			if (!String(imovel.localizacao || '').trim()) {
				imovel.localizacao = buildLocalizacaoFallback(imovel.bairro, imovel.cidade);
			}
		} catch (err) {
			console.warn(`[Triplice] Falha ao extrair titulo interno (${imovel.linkReal}): ${err.message}`);
		} finally {
			if (page) await page.close();
		}
	}

	return imoveis;
}
