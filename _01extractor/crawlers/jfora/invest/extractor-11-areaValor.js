// extractor-11-areaValor.js
export function extractAreaValor(cardNode) {
  const parentText = cardNode.find("li i.flaticon-square-layouting-with-black-square-in-east-area").parent().text() || "";
  const match = parentText.match(/\b\d[\d.]*(?:,\d+)?/);
  if (match && match[0]) {
    return Number(match[0].replace(/\./g, '').replace(',', '.')) || 0;
  }
  return 0;
}
