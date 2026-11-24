export function extractTitulo(cardHtml) {
	const textMatch = cardHtml.match(/<span[^>]*class=["'][^"']*type[^"']*["'][^>]*>([^<]+)<\/span>/i);
	if (textMatch?.[1]) return textMatch[1].trim();

	const titleMatch = cardHtml.match(/<span[^>]*class=["'][^"']*neighborhood[^"']*["'][^>]*>([^<]+)<\/span>/i);
	if (titleMatch?.[1]) return titleMatch[1].trim();

	const fallback = cardHtml.match(/<a[^>]+href=["'][^"']*\/imovel\/[^"']+["'][^>]*>([^<]+)<\/a>/i);
	if (fallback?.[1]) return fallback[1].trim();

	return textMatch?.[1]?.trim() || '';
}
