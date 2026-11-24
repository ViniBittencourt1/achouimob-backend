// Extrai o valor de vagas de garagem a partir do bloco do DirectionsCarIcon
export function extractGaragemValor($card) {
  // Extrai apenas se encontrar o DirectionsCarIcon
  const svg = $card.find('svg[data-testid="DirectionsCarIcon"]').first();
  if (svg.length) {
    const parent = svg.parent();
    const p = parent.find('p[aria-hidden="true"], p').first();
    if (p.length) {
      const val = p.text().trim();
      if (/^\d+$/.test(val)) return parseFloat(val) || 0;
    }
  }
  // Se não encontrar DirectionsCarIcon, retorna 0
  return 0;
}
