import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const bairrosPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../../_03database/filtros/_jfBairros.json');
let bairrosList = [];
try {
	bairrosList = JSON.parse(fs.readFileSync(bairrosPath, 'utf8'));
} catch (e) {
	console.error(`Erro ao carregar _jfBairros.json: ${e.message}`);
}

function normalizeBairro(value) {
	return String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[.,-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function findBairroSlug(value, cidade) {
	const normalized = normalizeBairro(value);
	if (!normalized) return '';
	const candidates = bairrosList.filter((item) => String(item?.cidade || '').trim() === cidade);
	const match = candidates.find((item) => normalizeBairro(item.nome) === normalized);
	return match?.slug || '';
}

// Extrai o campo localizacao de um card HTML
// cardHtml: string (HTML do card)
export function extractBairro(cardHtml, linkReal = '', cidade = '') {
	const dom = new JSDOM(cardHtml);
	const divLoc = dom.window.document.querySelector('div.imovel-item--localizacao');
	const localizacao = divLoc ? divLoc.textContent.trim() : '';
	if (!localizacao) return '';

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
	const bairroDoCard = bairro;
	const slugDoCard = findBairroSlug(bairroDoCard, cidade);
	if (slugDoCard) return slugDoCard;

	const bairroDoLink = (() => {
		try {
			const path = new URL(linkReal).pathname;
			return path.match(/--([^-/]+)--[^-/]+--(?:mg|rj|sp|es)--(?:venda|aluguel)/i)?.[1]?.replace(/_/g, ' ') || '';
		} catch {
			return '';
		}
	})();
	const slugDoLink = findBairroSlug(bairroDoLink, cidade);
	if (slugDoLink) return slugDoLink;

	return String(bairroDoCard || bairroDoLink || '').trim().toUpperCase();
}
