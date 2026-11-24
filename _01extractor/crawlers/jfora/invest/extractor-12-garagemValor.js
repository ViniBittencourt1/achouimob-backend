// extractor-12-garagemValor.js
export function extractGaragemValor(cardNode) {
  const parentText = cardNode.find("li i.flaticon-car-repair").parent().text() || "";
  const match = parentText.match(/\d+/);
  return match ? parseFloat(match[0]) : 0;
}
