import { load } from 'cheerio';

function extractTituloBase(cardHtml) {
	const textMatch = cardHtml.match(/<p[^>]*search-feat-card__cat-trans[^>]*>\s*<a[^>]*>\s*<strong>([^<]+)<\/strong>/i);
	if (textMatch?.[1]) return textMatch[1].trim();

	const titleMatch = cardHtml.match(/<img[^>]+alt=["']([^"']+)["']/i);
	if (titleMatch?.[1]) return titleMatch[1].trim();

	const fallback = cardHtml.match(/<a[^>]+href=["'][^"']*\/detalhes\/[^"']+["'][^>]*>([^<]+)<\/a>/i);
	if (fallback?.[1]) return fallback[1].trim();

	return textMatch?.[1]?.trim() || '';
}

export function extractTitulo(cardHtml, options = {}) {
	const titulo = extractTituloBase(cardHtml);
	if (!options.incluirTaxas) return titulo;

	const document = load(cardHtml);
	const taxas = document('.search-feat-card__taxas').first().text().replace(/\s+/g, ' ').trim();
	return [titulo, taxas].filter(Boolean).join(' | ');
}
