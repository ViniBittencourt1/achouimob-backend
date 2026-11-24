import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolverBairroCatalogo } from '../_utils/bairroCatalogo.js';
// Extrai o campo localizacao de um card HTML
// cardHtml: string (HTML do card)
// cidade: slug da cidade já identificada para este card (opcional), usado para
// restringir a busca no catálogo aos bairros daquela cidade e evitar colisão
// entre cidades diferentes que possuem bairro com o mesmo nome.
export function extractBairro(cardHtml, cidade = '', linkReal = '') {
	const dom = new JSDOM(cardHtml);
	const divLoc = dom.window.document.querySelector('div.imovel-item--localizacao');
	const localizacao = divLoc ? divLoc.textContent.trim() : '';

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

	// Busca no jfBairros.json
	const bairrosPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../../_03database/filtros/_jfBairros.json');
	let bairrosList = [];
	try {
		bairrosList = JSON.parse(fs.readFileSync(bairrosPath, 'utf8'));
	} catch (e) {
		// Se não conseguir ler, retorna o valor em maiúsculas
		return resolverBairroCatalogo(bairroNormalizado, cidade);
	}

	const cidadeNormalizada = cidade
		? cidade.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
		: '';
	const candidatos = cidadeNormalizada
		? bairrosList.filter((item) => (item.cidade || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim() === cidadeNormalizada)
		: bairrosList;
	const candidatosPrincipais = candidatos.filter((item) => String(item?.principal || 'sim').trim().toLowerCase() === 'sim');
	const candidatosOrdenados = [
		...candidatosPrincipais,
		...candidatos.filter((item) => String(item?.principal || 'sim').trim().toLowerCase() !== 'sim')
	];

	for (const item of candidatosOrdenados) {
		const nomeNorm = item.nome.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[.,-]/g, ' ').replace(/\s+/g, ' ').trim();
		if (bairroNormalizado === nomeNorm) {
			return item.slug || item.nome;
		}
	}

	const bairroDoLink = (() => {
		try {
			const pathname = new URL(linkReal).pathname;
			return pathname.match(/--([^-/]+)--[^-/]+--(?:mg|rj|sp|es)--(?:venda|aluguel)/i)?.[1]?.replace(/_/g, ' ') || '';
		} catch {
			return '';
		}
	})();
	const bairroDoLinkNormalizado = bairroDoLink.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[.,-]/g, ' ').replace(/\s+/g, ' ').trim();
	for (const item of candidatosOrdenados) {
		const nomeNorm = item.nome.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[.,-]/g, ' ').replace(/\s+/g, ' ').trim();
		if (bairroDoLinkNormalizado && bairroDoLinkNormalizado === nomeNorm) {
			return item.slug || item.nome;
		}
	}
	// Se não encontrar, retorna o valor encontrado em maiúsculas
	return resolverBairroCatalogo(bairroNormalizado || bairroDoLinkNormalizado, cidade);
}
