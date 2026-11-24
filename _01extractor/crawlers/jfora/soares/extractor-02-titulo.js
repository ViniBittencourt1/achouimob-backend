// Extrai o título do card HTML para Decisao
// Formato: "Apartamento São Pedro, Juiz de Fora / MG"
export function extractTitulo(cardHtml) {
	// Extrai o texto principal do <h2 class="pagina-titulo ng-binding">, ignorando spans internos
	const match = cardHtml.match(/<h2 class="pagina-titulo ng-binding">([\s\S]*?)<span class="detalhe-localizacao"/i);
	if (match) {
		// Remove quebras de linha e espaços extras
		return match[1].replace(/\s+/g, ' ').trim();
	}
	// Fallback: tenta pegar todo o conteúdo do h2 sem span
	const fallback = cardHtml.match(/<h2 class="pagina-titulo ng-binding">([\s\S]*?)<\/h2>/i);
	if (fallback) {
		return fallback[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
	}
	return '';
}
