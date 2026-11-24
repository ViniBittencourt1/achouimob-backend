// extractor-14-codigoBase.js
export function extractCodigoBase(cardNode) {
  const codText = cardNode.find(".detail a[href*='ImovelSelecionado']").text() || "";
  const match = codText.match(/Código:\s*(\d+)/i);
  return match ? match[1] : "";
}
