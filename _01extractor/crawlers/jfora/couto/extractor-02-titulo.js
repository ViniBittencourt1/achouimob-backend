export function extractTitulo(cardHtml) {
	const titleMatch = cardHtml.match(/<a[^>]+title=["']([^"']+)["'][^>]*>/i);
	if (titleMatch?.[1]) return titleMatch[1].trim();

	const textMatch = cardHtml.match(/<strong>\s*<a[^>]*>([^<]+)<\/a>\s*<\/strong>/i);
	return textMatch?.[1]?.trim() || '';
}
