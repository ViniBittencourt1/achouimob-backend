// extractor-01-linkReal.js
export function extractLinkReal(cardNode) {
  const linkHref = cardNode.find("a.property-img").attr("href") || "";
  if (!linkHref) return "";
  if (linkHref.startsWith("http")) return linkHref;
  // Garante que sempre será absoluto
  return "https://www.invest.com.br/" + linkHref.replace(/^\//, "");
}
