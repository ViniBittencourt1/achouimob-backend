// Extrai o valor de garagem buscando pelo nome do ícone "Garagem"
export function extractGaragemValor(cardHtml) {
  if (!cardHtml || typeof cardHtml !== 'string') return 0;
  // Busca o bloco <span class="rh_meta_titles">Garagem</span> seguido de <span class="figure">N</span>
  const match = cardHtml.match(/<span[^>]*class\s*=\s*(["'])rh_meta_titles\1[^>]*>\s*Garagem\s*<\/span>[\s\S]*?<span[^>]*class\s*=\s*(["'])figure\2[^>]*>(\d+)<\/span>/i);
  if (match) {
    return Number(match[3]);
  }
  return 0;
}
