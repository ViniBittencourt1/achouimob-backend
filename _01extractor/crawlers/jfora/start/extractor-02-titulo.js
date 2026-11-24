export function extractTitulo(cardHtml) {
	const titleStart = cardHtml.match(/<h4>\s*<a[^>]*>([^<]+)<\/a>\s*<\/h4>/i);
	if (titleStart?.[1]) return titleStart[1].trim();

	const textMatch = cardHtml.match(/<span[^>]*class=["'][^"']*type[^"']*["'][^>]*>([^<]+)<\/span>/i);
	if (textMatch?.[1]) return textMatch[1].trim();

	const titleMatch = cardHtml.match(/<span[^>]*class=["'][^"']*neighborhood[^"']*["'][^>]*>([^<]+)<\/span>/i);
	if (titleMatch?.[1]) return titleMatch[1].trim();

	const fallback = cardHtml.match(/<a[^>]+href=["'][^"']*\/imovel\/[^"']+["'][^>]*>([^<]+)<\/a>/i);
	if (fallback?.[1]) return fallback[1].trim();

	return textMatch?.[1]?.trim() || '';
}
