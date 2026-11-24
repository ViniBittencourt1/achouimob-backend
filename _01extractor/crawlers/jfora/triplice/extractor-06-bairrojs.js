import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

function normalizeText(text = '') {
	return String(text || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function findBairroSlugInText(text, cidade = '') {
	const textoNormalizado = normalizeText(text);
	const cidadeSlug = normalizeText(cidade);
	if (!textoNormalizado) return '';

	const matches = bairrosList
		.filter((bairro) => !cidadeSlug || normalizeText(bairro?.cidade) === cidadeSlug)
		.map((bairro) => ({
			slug: String(bairro?.slug || '').trim(),
			nome: normalizeText(bairro?.nome),
			slugNormalizado: normalizeText(bairro?.slug),
			principal: String(bairro?.principal || 'sim').trim().toLowerCase() === 'sim',
		}))
		.filter((bairro) => bairro.slug && bairro.nome && bairro.nome.length >= 4 && (textoNormalizado.includes(bairro.nome) || textoNormalizado === bairro.slugNormalizado));

	if (!matches.length) return '';
	matches.sort((a, b) => b.nome.length - a.nome.length || Number(b.principal) - Number(a.principal));
	return matches[0].slug;
}

function getBairroFromBreadcrumb(doc, cidade = '') {
	const cidadeDaUrl = String(cidade || '').replace(/-[a-z]{2}$/i, '').trim();
	const cidadeNormalizada = normalizeText(cidadeDaUrl.replace(/-/g, ' '));
	if (!cidadeDaUrl) return '';

	const breadcrumbs = Array.from(doc.querySelectorAll('ol .item-breadcrumb a'));
	const cidadeIndex = breadcrumbs.findIndex((link) => {
		const href = String(link.getAttribute('href') || '').toLowerCase();
		return normalizeText(link.textContent) === cidadeNormalizada || href.endsWith(`/${cidadeDaUrl}`);
	});
	if (cidadeIndex < 0) return '';

	return breadcrumbs[cidadeIndex + 1]?.textContent?.trim() || '';
}

// Extrai o campo localizacao de um card HTML
// cardHtml: string (HTML do card)
export function extractLocalizacao(cardHtml, fallbackText = '', cidade = '') {
	const dom = new JSDOM(cardHtml);
	const bairroBreadcrumb = getBairroFromBreadcrumb(dom.window.document, cidade);
	const bairroSlugDoBreadcrumb = findBairroSlugInText(bairroBreadcrumb, cidade);
	if (bairroSlugDoBreadcrumb) return bairroSlugDoBreadcrumb;

	const h2Loc = dom.window.document.querySelector('h2.card-title');
	let valor = h2Loc ? h2Loc.textContent.trim() : '';
	if (valor.includes('-')) {
		// Se houver '-', extrai o valor antes dele
		valor = valor.split('-')[0].trim();
	}
	// Normaliza para busca
	const bairroSlug = findBairroSlugInText(valor, cidade);
	if (bairroSlug) return bairroSlug;

	const bairroSlugFromTitulo = findBairroSlugInText(fallbackText, cidade);
	if (bairroSlugFromTitulo) return bairroSlugFromTitulo;

	// Se não encontrar, retorna o valor em maiúsculas
	return '';
}

export const extractBairro = extractLocalizacao;
