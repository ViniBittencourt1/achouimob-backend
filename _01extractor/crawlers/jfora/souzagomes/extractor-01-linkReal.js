// extractor-01-linkReal.js
export function extractLinkReal(cardNode) {
  const linkHref = cardNode.find("a.imovel-item--body").attr("href") || "";
  return linkHref ? `https://souzagomes.com.br${linkHref}` : "";
}
