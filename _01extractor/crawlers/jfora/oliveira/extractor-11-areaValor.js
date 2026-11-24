// Extrai o valor da área (m²) de um card HTML na rota externa
// Busca dentro de <ul class="mb-0"> o <li> com texto "m²" e retorna o número anterior
export function extractAreaValor(cardHtml) {
  if (!cardHtml || typeof cardHtml !== 'string') return 0;
  const ulMatch = cardHtml.match(/<ul[^>]*class\s*=\s*(['\"]?)mb-0\1[^>]*>([\s\S]*?)<\/ul>/i);
  if (!ulMatch) return 0;
  const ulContent = ulMatch[2];
  const liRegex = /<li[^>]*([\s\S]*?)<\/li>/gi;
  let liMatch;
  while ((liMatch = liRegex.exec(ulContent)) !== null) {
    const liHtml = liMatch[1];
    // Busca por "Área Útil (m²)" ou "M²" no texto
    if (/data-bs-original-title=["']?Área Útil \(m²\)["']?/i.test(liHtml) || /M²/i.test(liHtml)) {
      const numMatch = liHtml.match(/<span[^>]*>\s*([\d]+)\s*<\/span>/i);
      if (numMatch) {
        return parseFloat(numMatch[1].replace(',', '.').trim()) || 0;
      }
    }
  }
  return 0;
}
