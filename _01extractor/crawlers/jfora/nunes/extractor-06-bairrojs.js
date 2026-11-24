import { resolverBairroCatalogo } from '../_utils/bairroCatalogo.js';
// Export padrÃ£o para compatibilidade
export const extractBairro = extractLocalizacao;
import { JSDOM } from 'jsdom';

function normalizarTexto(valor = '') {
	return String(valor).normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[\/_.-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function extractBairroFromHeaderTitle(titulo, cidade = '') {
	const partes = String(titulo || '').replace(/\s+/g, ' ').trim().split(/\s+-\s+/);
	if (partes.length < 3 || normalizarTexto(partes.at(-1)) !== normalizarTexto(cidade)) return '';
	return resolverBairroCatalogo(partes.at(-2), cidade);
}

export function extractBairroFromLocalizacao(localizacao, cidade = '') {
	const partes = String(localizacao || '').replace(/\s+/g, ' ').trim().split(/\s+-\s+/);
	if (partes.length < 2 || normalizarTexto(partes.at(-1)) !== normalizarTexto(cidade)) return '';
	return resolverBairroCatalogo(partes.at(-2), cidade);
}

export function extractBairroFromBreadcrumb(html, cidade = '') {
	const dom = new JSDOM(String(html || ''));
	const breadcrumbs = Array.from(dom.window.document.querySelectorAll('ol li.item-breadcrumb'));
	const cidadeSemUf = String(cidade || '').replace(/-[a-z]{2}$/i, '');
	const cidadeNorm = normalizarTexto(cidadeSemUf);
	const indiceCidade = breadcrumbs.findIndex(item => {
		const texto = normalizarTexto(item.querySelector('a')?.textContent || item.textContent);
		if (texto === cidadeNorm) return true;
		const href = item.querySelector('a')?.getAttribute('href') || '';
		return normalizarTexto(href.split('/').filter(Boolean).at(-1) || '') === cidadeNorm;
	});
	if (indiceCidade < 0) return '';
	const bairroItem = breadcrumbs[indiceCidade + 1];
	if (!bairroItem || bairroItem.classList.contains('item-breadcrumb-last')) return '';
	return resolverBairroCatalogo(bairroItem.querySelector('a')?.textContent?.trim() || '', cidade);
}

// Extrai o campo localizacao de um card HTML
// cardHtml: string (HTML do card)
export function extractLocalizacao(cardHtml, cidade = '') {
	const dom = new JSDOM(cardHtml);
	const h2Loc = dom.window.document.querySelector('h2.card-with-buttons__heading');
	let valor = h2Loc ? h2Loc.textContent.trim() : '';
	if (valor.includes('-')) {
		// Se houver '-', extrai o valor antes dele
		valor = valor.split('-')[0].trim();
	}
	const bairroResolvido = resolverBairroCatalogo(valor, cidade);
	if (bairroResolvido) return bairroResolvido;
	const headerTitle = dom.window.document.querySelector('.header-title span')?.textContent || '';
	const bairroDoHeader = extractBairroFromHeaderTitle(headerTitle, cidade);
	if (bairroDoHeader) return bairroDoHeader;
	const localizacao = dom.window.document.querySelector('.address-card__content__address')?.textContent || '';
	return extractBairroFromLocalizacao(localizacao, cidade);
}
