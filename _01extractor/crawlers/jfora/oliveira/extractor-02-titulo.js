// Extrai o título do imóvel do cardHtml, pegando o conteúdo de <p class="product-title">
export function extractTitulo(cardHtml) {
    if (!cardHtml || typeof cardHtml !== 'string') return '';
    const match = cardHtml.match(/<p[^>]*class\s*=\s*(["'])product-title\1[^>]*>([\s\S]*?)<\/p>/i);
    if (match) {
        // Remove tags HTML internas e espaços extras
        let text = match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        return text;
    }
    return '';
}
