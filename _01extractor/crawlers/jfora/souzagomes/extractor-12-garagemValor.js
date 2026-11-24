// extractor-12-garagemValor.js
export function extractGaragemValor(cardNode) {
  const text = cardNode.find('div[data-icon="vagas"] small').text().trim();
  const match = text.match(/\d+/);
  return match ? parseFloat(match[0]) || 0 : 0;
}
