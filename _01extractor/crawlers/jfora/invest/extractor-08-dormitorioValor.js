// extractor-08-dormitorioValor.js
export function extractDormitorioValor(cardNode) {
  const parentText = cardNode.find("li i.flaticon-bed").parent().text() || "";
  const match = parentText.match(/\d+/);
  if (match && match[0] !== undefined && match[0] !== null && match[0] !== "") {
    return Number(match[0]);
  }
  return 0;
}
