// Extrai o título do card HTML para Fontes
// Formato: "Apartamento São Pedro, Juiz de Fora / MG"
export function extractTitulo(cardHtml) {
	// Extrair tipo do imóvel
	const tipoMatch = cardHtml.match(/<p class="imovelcard__info__ref">.*?<strong>.*?<\/strong>\s*-\s*([^<]+)<\/p>/i);
	const tipo = tipoMatch ? tipoMatch[1].trim() : '';

	// Extrair local
	const localMatch = cardHtml.match(/<h2 class="imovelcard__info__local">([^<]+)<\/h2>/i);
	const local = localMatch ? localMatch[1].trim() : '';

	// Montar título
	return [tipo, local].filter(Boolean).join(' ');
}
