// extractor-04-localizacao.js
export function extractLocalizacao(cardNode) {
  return cardNode.find(".imovel-item--localizacao").text().trim() || "";
}
