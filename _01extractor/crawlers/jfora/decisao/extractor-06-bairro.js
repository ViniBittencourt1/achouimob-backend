import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';
import { resolverBairroCatalogo } from '../_utils/bairroCatalogo.js';

function extrairBairroDoLink(linkReal, cidade) {
	const link = String(linkReal || '').toLowerCase();
	if (!link) return '';

	const bairroAposCidade = link.match(/-juiz-de-fora-mg-([a-z0-9-]+)$/i)?.[1];
	const bairroAposVenda = link.match(/-venda-([a-z0-9-]+)$/i)?.[1];
	const bairroNoLink = bairroAposCidade || bairroAposVenda;
	return bairroNoLink ? resolverBairroCatalogo(bairroNoLink, cidade) : '';
}

// Extrai o campo localizacao de um card HTML
// cardHtml: string (HTML do card)
export function extractBairroFromTitulo(cardHtml, cidade = '', linkReal = '') {
	const dom = new JSDOM(cardHtml);
	const h2 = dom.window.document.querySelector('h2.imovelcard__info__local');
	const localizacao = h2 ? h2.textContent.trim() : '';
	if (!localizacao) return extrairBairroDoLink(linkReal, cidade);
	// Extrai o valor anterior à vírgula
	const partes = localizacao.split(',').map(p => p.trim()).filter(Boolean);
	let bairro = partes.length > 0 ? partes[0] : localizacao;
	// Normaliza: remove acentos, lowercase, remove pontuação isolada e espaços extras
	const bairroNormalizado = bairro.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[.,-]/g, ' ').replace(/\s+/g, ' ').trim();
	return resolverBairroCatalogo(bairroNormalizado, cidade) || extrairBairroDoLink(linkReal, cidade);

	// Busca no jfBairros.json
	const bairrosPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../../_03database/filtros/_jfBairros.json');
	let bairrosList = [];
	try {
		bairrosList = JSON.parse(fs.readFileSync(bairrosPath, 'utf8'));
	} catch (e) {
		// Se não conseguir ler, retorna o valor em maiúsculas
		return bairroNormalizado.toUpperCase();
	}
	for (const item of bairrosList) {
		const nomeNorm = item.nome.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[.,-]/g, ' ').replace(/\s+/g, ' ').trim();
		if (bairroNormalizado === nomeNorm) {
			return item.slug || item.nome;
		}
	}
	// Se não encontrar, retorna o valor encontrado em maiúsculas
	return bairroNormalizado.toUpperCase();
}
