// Extrai o código base do HTML do card
// cardHtml: string (HTML do card)
export function extractCodigoBase(cardHtml) {
  const match = cardHtml.match(/<p class="imovelcard__info__ref">\s*<strong>Ref:\s*([^<]+)<\/strong>/i);
  return match ? match[1].trim() : '';
}
