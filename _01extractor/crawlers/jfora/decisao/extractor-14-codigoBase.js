// Extrai o código base do HTML do card
// cardHtml: string (HTML do card)
export function extractCodigoBase(cardHtml) {
  // Captura o valor após 'Ref:' até o fechamento da tag strong
  const match = cardHtml.match(/<p[^>]*imovelcard__info__ref[^>]*>.*?<strong>\s*Ref:?\s*([^<\s]+)\s*<\/strong>/is);
  let codigo = match && match[1] ? match[1].trim() : '';
  // Se for vazio, nulo ou zero, busca o código no link
  if (!codigo || codigo === '0' || codigo === 'null') {
    const linkMatch = cardHtml.match(/https:\/\/www\.imobiliariadecisaojf\.com\.br\/mobile\/imovel\/(\d+)/i);
    codigo = linkMatch ? linkMatch[1].trim() : '';
  }
  return codigo;
}
