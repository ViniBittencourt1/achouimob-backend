// Extrai o código base do HTML do card
// cardHtml: string (HTML do card)
export function extractCodigoBase(cardHtml) {
  // Captura o valor após 'Ref:' até o fechamento da tag strong
  const match = cardHtml.match(/<p[^>]*imovelcard__info__ref[^>]*>.*?<strong>\s*Ref:?\s*([^<\s]+)\s*<\/strong>/is);
  return match ? match[1].trim() : '';
}
