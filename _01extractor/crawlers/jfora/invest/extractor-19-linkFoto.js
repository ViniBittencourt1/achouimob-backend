// extractor-19-linkFoto.js
export function extractLinkFoto(cardNode) {
  return cardNode.find("a.property-img img").attr("src") || "";
}
