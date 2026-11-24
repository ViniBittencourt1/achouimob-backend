import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolverBairroCatalogo } from '../_utils/bairroCatalogo.js';

function extrairBairroDoLink(linkReal, cidade) {
	const cidadeNoLink = String(cidade || '').replace(/-mg$/, '').replace(/-/g, '_');
	if (!linkReal || !cidadeNoLink) return '';

	const bairroNoLink = String(linkReal).match(new RegExp(`--(.+?)--${cidadeNoLink}--[a-z]{2}--`, 'i'))?.[1];
	return bairroNoLink ? resolverBairroCatalogo(bairroNoLink, cidade) : '';
}

// Extrai o campo localizacao de um card HTML
// cardHtml: string (HTML do card)
export function extractBairro(cardHtml, cidade = '', linkReal = '') {
	const dom = new JSDOM(cardHtml);
	const divLoc = dom.window.document.querySelector('div.imovel-item--localizacao');
	const localizacao = divLoc ? divLoc.textContent.trim() : '';
	if (!localizacao) return extrairBairroDoLink(linkReal, cidade);

	// Normaliza para busca de "bairro"
	const localizacaoNorm = localizacao.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
	const match = localizacaoNorm.match(/bairro\s*([^,]*)/i);
	let resultado = '';
	if (match && match[1]) {
		// Extrai o valor após "bairro" e antes da vírgula
		resultado = match[1].trim();
	} else {
		resultado = localizacao;
	}

	// Extrai o valor antes da vírgula
	const partes = resultado.split(',').map(p => p.trim()).filter(Boolean);
	let bairro = partes.length > 0 ? partes[0] : resultado;
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
	return extrairBairroDoLink(linkReal, cidade) || bairroNormalizado.toUpperCase();
}
