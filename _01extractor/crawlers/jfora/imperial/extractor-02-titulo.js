// Extrai o título do card HTML para Imperial
// Formato real: <h3 class="cor2">Bairro, Cidade / UF</h3> + <small><strong>Ref: XXX</strong>Tipo</small>
export function extractTitulo(cardHtml) {
	// Extrair tipo do imóvel (texto apos o </strong> dentro do <small>)
	const tipoMatch = cardHtml.match(/<strong>\s*Ref:?[^<]*<\/strong>([^<]+)</i);
	const tipo = tipoMatch ? tipoMatch[1].replace(/&nbsp;/g, '').trim() : '';

	// Extrair local
	const localMatch = cardHtml.match(/<h3 class="cor2">([^<]+)<\/h3>/i);
	const local = localMatch ? localMatch[1].trim() : '';

	// Montar título
	return [tipo, local].filter(Boolean).join(' ');
}
