
// Extrai o código base do HTML do card
// cardHtml: string (HTML do card)
export function extractCodigoBase(cardHtml) {
  // Busca o código no novo HTML: <div class="GalleryPiecesProperties_codigoImovel__K1tn1">Código: CA0082</div>
  const match = cardHtml.match(/<div[^>]*GalleryPiecesProperties_codigoImovel[^>]*>\s*Código:\s*([A-Z0-9]+)/i);
  let codigo = match && match[1] ? match[1].trim() : '';
  // Se não encontrar, retorna vazio
  return codigo;
}
