// extractor-01-linkReal.js
// Esta função é idêntica à da rota externa, mas mantemos a separação para clareza.
export function extractLinkReal($card) {
  // Cheerio: $card é um objeto Cheerio
  const linkEl = $card.find("a").first();
  return linkEl.length ? linkEl.attr("href") : "";
}
