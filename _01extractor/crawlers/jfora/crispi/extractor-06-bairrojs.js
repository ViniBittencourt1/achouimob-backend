import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolverBairroCatalogo } from '../_utils/bairroCatalogo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega a lista de bairros válidos
const bairrosPath = path.resolve(__dirname, '../../../../_03database/filtros/_jfBairros.json');
let bairrosList = [];
try {
	bairrosList = JSON.parse(fs.readFileSync(bairrosPath, 'utf8'));
} catch (e) {
	bairrosList = [];
}
import { JSDOM } from 'jsdom';

function normalizarTexto(valor = '') {
	return String(valor).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function buscarBairro(valor, cidade = '') {
	const normalizado = normalizarTexto(valor);
	return bairrosList.find((bairro) =>
		(!cidade || bairro.cidade === cidade) &&
		(normalizarTexto(bairro.nome) === normalizado || normalizarTexto(bairro.slug) === normalizado)
	)?.slug || '';
}

function extrairBairroDoLink(linkReal = '') {
	try {
		return new URL(linkReal).pathname.match(/-(?:mg|rj|sp|es)-(.+)$/i)?.[1] || '';
	} catch {
		return '';
	}
}

export function extractBairro(cardHtml, cidade = '', linkReal = '') {
	const bairroDoLink = extrairBairroDoLink(linkReal);
	const bairroCompletoDoLink = buscarBairro(bairroDoLink, cidade);
	if (bairroCompletoDoLink) return bairroCompletoDoLink;

	for (const parteDoLink of bairroDoLink.split(/[-_]+/).filter(Boolean)) {
		const bairroIndividualDoLink = buscarBairro(parteDoLink, cidade);
		if (bairroIndividualDoLink) return bairroIndividualDoLink;
	}

	const dom = new JSDOM(cardHtml);
	const h2Loc = dom.window.document.querySelector('h2.card-title');
	let valor = h2Loc ? h2Loc.textContent.trim() : '';
	if (valor.includes('-')) {
		// Se houver '-', extrai o valor antes dele
		valor = valor.split('-')[0].trim();
	}
	const bairroEncontrado = buscarBairro(valor, cidade);
	if (bairroEncontrado) return bairroEncontrado;
	// Se não encontrar, retorna o valor em maiúsculas
	return resolverBairroCatalogo(valor, cidade);
}
