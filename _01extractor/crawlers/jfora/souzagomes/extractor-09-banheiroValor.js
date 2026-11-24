// extractor-09-banheiroValor.js
export function extractBanheiroSocialValor(cardNode) {
  const text = cardNode.find('div[data-icon="banheiros"] small').text().trim();
  const match = text.match(/\d+/);
  return match ? parseFloat(match[0]) || 0 : 0;
}
