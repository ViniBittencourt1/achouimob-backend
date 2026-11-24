// Extrai o título do card HTML para Decisao
// Formato: "Apartamento São Pedro, Juiz de Fora / MG"
export function extractTitulo(cardHtml) {
  // Extrai o texto do titulo do card (a tag pode variar entre h2/h3 e a classe tem hash dinâmico)
  const match = cardHtml.match(/<h[23][^>]*class=["'][^"']*CardApartamentHorizontal_property_type[^"']*["'][^>]*>([\s\S]*?)<\/h[23]>/i);
  if (match) {
    return match[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  }
  return '';
}
