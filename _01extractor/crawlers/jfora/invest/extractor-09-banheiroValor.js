// extractor-09-banheiroValor.js
export function extractBanheiroValor(cardNode) {
  const parentText = cardNode.find("li i.flaticon-bath").parent().text() || "";
  const match = parentText.match(/\d+/);
  if (match && match[0] !== undefined && match[0] !== null && match[0] !== "") {
    return Number(match[0]);
  }
  return 0;
}
