import { JSDOM } from 'jsdom';
// Extrai o título a partir do card no layout antigo.
export function extractTitulo(cardHtml) {
	const dom = new JSDOM(cardHtml);
	const doc = dom.window.document;
	const tituloDetalhe = doc.querySelector('.cont-title h1 span, .cont-title h1, .cont-title h2 span, .cont-title h2');
	if (tituloDetalhe && tituloDetalhe.textContent.trim()) {
		return tituloDetalhe.textContent.trim().replace(/\s+/g, ' ');
	}

	const titulo = doc.querySelector('h3.card-text');
	if (titulo && titulo.textContent.trim()) {
		return titulo.textContent.trim().replace(/\s+/g, ' ');
	}

	const tituloCard = doc.querySelector('p.card-with-buttons__title');
	return tituloCard ? tituloCard.textContent.trim().replace(/\s+/g, ' ') : '';
}
