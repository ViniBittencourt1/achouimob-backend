// Extrai o código base do HTML do card
// cardHtml: string (HTML do card). Formato real: <small><strong>Ref: CAS 03</strong>...</small>
export function extractCodigoBase(cardHtml) {
  const match = cardHtml.match(/<strong>\s*Ref:?\s*([^<]+?)\s*<\/strong>/is);
  return match ? match[1].trim() : '';
}
