// Extrai o valor de banheiros de um card HTML na rota externa
// Busca dentro de <ul class="mb-0"> o <li> com texto "banheiro" e retorna o número anterior
export function extractBanheiroValor(cardHtml) {
  if (!cardHtml || typeof cardHtml !== 'string') return 0;
  const ulMatch = cardHtml.match(/<ul[^>]*class\s*=\s*(['\"]?)mb-0\1[^>]*>([\s\S]*?)<\/ul>/i);
  if (!ulMatch) return 0;
  const ulContent = ulMatch[2];
  const liRegex = /<li[^>]*([\s\S]*?)<\/li>/gi;
  let liMatch;
  while ((liMatch = liRegex.exec(ulContent)) !== null) {
    const liHtml = liMatch[1];
    if (/data-bs-original-title=["']?Banheiro\(s\)["']?/i.test(liHtml) || /Banheiro\(s\)/i.test(liHtml)) {
      const numMatch = liHtml.match(/<span[^>]*>\s*([\d]+)\s*<\/span>/i);
      if (numMatch) {
        return Number(numMatch[1].trim());
      }
    }
  }
  return 0;
}
