// extractor-11-areaValor.js
export function extractAreaValor($card) {
  const testid = "SquareFootIcon";
  const svg = $card.find(`svg[data-testid='${testid}']`).first();
  if (svg.length) {
    let parent = svg.parent();
    for (let i = 0; i < 4 && parent.length; i++, parent = parent.parent()) {
      const p = parent.find("p[aria-hidden='true']").first();
      if (p.length && p.text().trim()) {
        const match = p.text().trim().match(/(\d+[\.,]?\d*)/);
        if (match) return parseFloat(match[1].replace(',', '.')) || 0;
      }
    }
  }
  // Só retorna valor se encontrar SquareFootIcon
  return 0;
}
