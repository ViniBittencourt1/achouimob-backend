// Extrai o título do imóvel do cardHtml, pegando o conteúdo de <p class="product-title">
export function extractTitulo(cardHtml) {
    if (!cardHtml || typeof cardHtml !== 'string') return '';
    // Busca o texto do <h3><a ...>...</a></h3>
    const match = cardHtml.match(/<h3>\s*<a [^>]*>([\s\S]*?)<\/a>\s*<\/h3>/i);
    if (match) {
        let text = match[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        return text;
    }
    return '';
}
