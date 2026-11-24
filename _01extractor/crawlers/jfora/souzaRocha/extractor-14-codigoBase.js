// Extrai o código base do <p class="id"> dentro de <div class="rh_property__id">
export function extractCodigoBase(cardHtml) {
  if (!cardHtml || typeof cardHtml !== 'string') return '';
  // Extrai o valor do <p class="id"> dentro de <div class="rh_property__id">
  const match = cardHtml.match(/<div[^>]*class\s*=\s*(["'])rh_property__id\1[^>]*>[\s\S]*?<p[^>]*class\s*=\s*(["'])id\2[^>]*>([\s\S]*?)<\/p>/i);
  if (match) {
    let text = match[3].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').replace(/\s+/g, '').trim();
    if (/^nenhum$/i.test(text)) return '';
    // Extrai apenas o padrão RH-XXXXX-
    const codeMatch = text.match(/RH-?(\d+)/i);
    if (codeMatch) {
      return `RH${codeMatch[1]}`;
    }
    return text;
  }
  return '';
}
