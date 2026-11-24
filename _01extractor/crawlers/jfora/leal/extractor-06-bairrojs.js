import { resolverBairroCatalogo } from '../_utils/bairroCatalogo.js';
// Export padrão para compatibilidade
export const extractBairro = extractLocalizacao;
import { JSDOM } from 'jsdom';

function extractBairroDoHeader(headerTitle, cidade) {
	const partes = String(headerTitle || '').replace(/\s+/g, ' ').trim().split(/\s+-\s+/);
	if (partes.length < 3 || normalizarBairro(partes.at(-1)) !== normalizarBairro(cidade)) return '';
	return partes.at(-2).trim();
}

export function extractBairroFromBreadcrumb(html, cidade = '') {
	const doc = JSDOM.fragment(String(html || ''));
	const breadcrumbs = Array.from(doc.querySelectorAll('ol li.item-breadcrumb'));
	const cidadeSemUf = String(cidade || '').replace(/-[a-z]{2}$/i, '');
	const cidadeNorm = normalizarBairro(cidadeSemUf);
	const indiceCidade = breadcrumbs.findIndex(item => {
		const texto = normalizarBairro(item.querySelector('a')?.textContent || item.textContent);
		if (texto === cidadeNorm) return true;
		const href = item.querySelector('a')?.getAttribute('href') || '';
		const ultimoSegmento = href.split('/').filter(Boolean).at(-1) || '';
		return normalizarBairro(ultimoSegmento) === cidadeNorm;
	});
	if (indiceCidade < 0) return '';

	const bairroItem = breadcrumbs[indiceCidade + 1];
	if (!bairroItem || bairroItem.classList.contains('item-breadcrumb-last')) return '';
	const bairro = bairroItem.querySelector('a')?.textContent?.trim() || '';
	return resolverBairroCatalogo(bairro, cidade);
}

function normalizarBairro(valor = '') {
	return String(valor).normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[\/_.-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

// Extrai o campo localizacao de um card HTML
// cardHtml: string (HTML do card)
export function extractLocalizacao(cardHtml, cidade = '') {
	const doc = JSDOM.fragment(cardHtml);
	const h2Loc = doc.querySelector('h2.card-title');
	const bairroDoCard = h2Loc?.textContent?.trim() || '';
	const bairroCatalogado = resolverBairroCatalogo(bairroDoCard, cidade);
	if (bairroCatalogado) return bairroCatalogado;

	const headerTitle = doc.querySelector('.header-title span')?.textContent || '';
	const bairroDoHeader = extractBairroDoHeader(headerTitle, cidade);
	const bairroCatalogadoDoHeader = resolverBairroCatalogo(bairroDoHeader, cidade);
	if (bairroCatalogadoDoHeader) return bairroCatalogadoDoHeader;
	return extractBairroFromBreadcrumb(cardHtml, cidade);
}
