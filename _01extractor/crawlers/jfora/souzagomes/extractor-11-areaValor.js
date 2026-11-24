// extractor-11-areaValor.js
export function extractAreaValor(cardNode) {
  const text = cardNode.find('div[data-icon="area_iptu"] small').text().trim();
  const match = text.match(/(\d+)/);
  return match ? parseFloat(match[1]) || 0 : 0;
}
