
// Extrai o código base do HTML do card na rota externa
// Busca o valor após 'REF' em <div class="float-left">
export function extractCodigoBase(cardHtml) {
  if (!cardHtml || typeof cardHtml !== 'string') return '';
  const match = cardHtml.match(/<div[^>]*class\s*=\s*(["'])float-left\1[^>]*>([\s\S]*?)<\/div>/i);
  if (match) {
    let text = match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    // Busca o valor após 'REF'
    const refMatch = text.match(/REF\s*([A-Z0-9]+)/i);
    if (refMatch) {
      return refMatch[1].trim();
    }
  }
  return '';
}
