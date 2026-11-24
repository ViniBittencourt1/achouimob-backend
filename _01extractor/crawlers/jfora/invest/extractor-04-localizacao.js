// extractor-04-localizacao.js
export function extractLocalizacao(cardNode) {
  return cardNode.find("a[href*='properties-details']").text().trim() || "";
}
