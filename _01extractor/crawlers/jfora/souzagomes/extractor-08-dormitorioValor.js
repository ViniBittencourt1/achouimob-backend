// extractor-08-dormitorioValor.js
export function extractDormitorioValor(cardNode) {
  const text = cardNode.find('div[data-icon="quartos"] small').text().trim();
  const match = text.match(/\d+/);
  return match ? parseFloat(match[0]) || 0 : 0;
}
