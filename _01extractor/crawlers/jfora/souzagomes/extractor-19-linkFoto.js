// extractor-19-linkFoto.js
export function extractLinkFoto(cardNode) {
  return cardNode.find('img[alt^="Foto cadastro"]').attr("src") || "";
}
