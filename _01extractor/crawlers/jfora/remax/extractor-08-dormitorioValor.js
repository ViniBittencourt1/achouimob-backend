// Extrai o valor de dormitórios a partir do bloco do BedIcon
export function extractDormitorioValor($card) {
	// Extrai apenas se encontrar o BedIcon
	const svg = $card.find('svg[data-testid="BedIcon"]').first();
	if (svg.length) {
		const parent = svg.parent();
		const p = parent.find('p[aria-hidden="true"], p').first();
		if (p.length) {
			const val = p.text().trim();
			if (/^\d+$/.test(val)) return parseFloat(val) || 0;
		}
	}
	// Se não encontrar BedIcon, retorna 0
	return 0;
}
