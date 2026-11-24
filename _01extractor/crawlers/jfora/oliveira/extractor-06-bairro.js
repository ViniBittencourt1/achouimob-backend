import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const bairrosPath = path.resolve(__dirname, '../../../../_03database/filtros/_jfBairros.json');

function loadBairrosList() {
	try {
		const data = JSON.parse(fs.readFileSync(bairrosPath, 'utf8'));
		return Array.isArray(data) ? data : [];
	} catch (e) {
		return [];
	}
}

function normalize(str) {
	return String(str || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function slugify(text) {
	return normalize(text)
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function stripHtml(html) {
	return String(html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function findBairroSlugByName(nome, bairrosList, cidade = '') {
	const bairroNorm = normalize(nome).trim();
	const cidadeNorm = normalize(cidade);
	if (!bairroNorm) return '';

	const bairrosFiltrados = cidadeNorm
		? bairrosList.filter((bairro) => normalize(bairro?.cidade) === cidadeNorm)
		: bairrosList;

	for (const bairro of bairrosFiltrados) {
		const nomeNorm = normalize(bairro?.nome).trim();
		if (bairro?.slug && (nomeNorm === bairroNorm || normalize(bairro?.slug) === bairroNorm)) {
			return bairro.slug;
		}
	}

	return '';
}

function findBairroSlugInLinkReal(linkReal, bairrosList, cidade = '') {
	const cidadeSlug = String(cidade || '').trim();
	const cidadeSemEstado = cidadeSlug.replace(/-[a-z]{2}$/i, '');
	if (!linkReal || !cidadeSemEstado) return '';

	let pathname = String(linkReal || '');
	try {
		pathname = new URL(linkReal).pathname;
	} catch (e) {}

	const slugPath = slugify(decodeURIComponent(pathname));
	if (!slugPath) return '';

	const bairrosDaCidade = bairrosList
		.filter((bairro) => String(bairro?.cidade || '').trim() === cidadeSlug && bairro?.slug)
		.sort((a, b) => String(b.slug || '').length - String(a.slug || '').length);

	for (const bairro of bairrosDaCidade) {
		const bairroSlug = String(bairro.slug || '').trim();
		const regex = new RegExp(`(^|-)${bairroSlug}-${cidadeSemEstado}(-|$)`, 'i');
		if (regex.test(slugPath)) {
			return bairroSlug;
		}
	}

	return '';
}

function extractTituloText(cardHtml) {
	const match = cardHtml.match(/<p[^>]*class\s*=\s*(["'])product-title\1[^>]*>([\s\S]*?)<\/p>/i);
	return match ? stripHtml(match[2]) : '';
}

function extractBairroNameFromTitulo(titulo) {
	const match = String(titulo || '').match(/(?:^|\W)bairro\s+(.+?)(?:\s*[-–—]\s*|$)/i);
	return match ? match[1].replace(/[.,;:]+$/g, '').trim() : '';
}

// Extrai o bairro do <span class="mb-sm-20">, pega o valor antes da vírgula e busca no JSON
export function extractBairro(cardHtml, fallbackText = '', cidade = '', linkReal = '') {
	if (!cardHtml || typeof cardHtml !== 'string') return '';
	const bairrosList = loadBairrosList();
	const bairroSlugFromLink = findBairroSlugInLinkReal(linkReal, bairrosList, cidade);
	const match = cardHtml.match(/<span[^>]*class\s*=\s*(["'])mb-sm-20\1[^>]*>([\s\S]*?)<\/span>/i);
	if (match) {
		       let text = stripHtml(match[2]);
		       // Formata para "Santa Cruz, Juiz de Fora, Minas Gerais"
		       text = text.toLowerCase().replace(/(^|, )([a-záéíóúãõâêîôûç]+)/g, (m, sep, word) => sep + word.charAt(0).toUpperCase() + word.slice(1));
			if (text) {
				const bairroProcurado = text.split(',')[0].trim();
				const bairroSlug = findBairroSlugByName(bairroProcurado, bairrosList, cidade);
				if (bairroSlug) return bairroSlug;
				const titulo = extractTituloText(cardHtml) || fallbackText;
				const bairroFromTitulo = extractBairroNameFromTitulo(titulo);
				const bairroSlugFromTitulo = findBairroSlugByName(bairroFromTitulo, bairrosList, cidade);
				if (bairroSlugFromTitulo) return bairroSlugFromTitulo;
				if (bairroSlugFromLink) return bairroSlugFromLink;
				return '';
			}
	}

	const titulo = extractTituloText(cardHtml) || fallbackText;
	const bairroFromTitulo = extractBairroNameFromTitulo(titulo);
	const bairroSlugFromTitulo = findBairroSlugByName(bairroFromTitulo, bairrosList, cidade);
	if (bairroSlugFromTitulo) return bairroSlugFromTitulo;
	if (bairroSlugFromLink) return bairroSlugFromLink;

	return '';
}
