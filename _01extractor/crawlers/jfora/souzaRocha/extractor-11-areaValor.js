// Extrai o valor de área buscando pelo nome do ícone "Área"
export function extractAreaValor(cardHtml) {
  if (!cardHtml || typeof cardHtml !== 'string') return 0;
  // Busca o bloco <span class="rh_meta_titles">Área</span> seguido de <span class="figure">N</span>
  const match = cardHtml.match(/<span[^>]*class\s*=\s*(["'])rh_meta_titles\1[^>]*>\s*Área\s*<\/span>[\s\S]*?<span[^>]*class\s*=\s*(["'])figure\2[^>]*>([\d,.]+)<\/span>/i);
  if (match) {
    // Remove .00 se existir
    const valor = match[3].replace(/\.00$/, "");
    return parseFloat(valor.replace(',', '.')) || 0;
  }
  return 0;
}
