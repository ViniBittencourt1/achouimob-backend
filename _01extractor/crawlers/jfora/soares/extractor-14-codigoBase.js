
// Extrai o código base do HTML do card
// cardHtml: string (HTML do card)
export function extractCodigoBase(cardHtml) {
  // Busca o <li> que contém 'Código:' e pega o valor do <strong class="ng-binding">
  const match = cardHtml.match(/<li[^>]*>\s*<span[^>]*icons-codigo[^>]*><\/span>\s*Código:\s*<strong class="ng-binding">([^<]+)<\/strong>/i);
  let codigo = match && match[1] ? match[1].trim() : '';
  // Se for vazio, nulo ou zero, busca o código no link
  if (!codigo || codigo === '0' || codigo === 'null') {
    // Ajuste para buscar no link real se necessário (adaptar domínio se necessário)
    const linkMatch = cardHtml.match(/\/imovel\/[^"']*\/(REFV\d+)/i);
    codigo = linkMatch ? linkMatch[1].trim() : '';
  }
  return codigo;
}
