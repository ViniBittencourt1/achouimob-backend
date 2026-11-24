import { JSDOM } from 'jsdom';
// Extrai o título do card no layout card-with-buttons.
export function extractTitulo(cardHtml) {
	const dom = new JSDOM(cardHtml);
	const doc = dom.window.document;
	const titulo = doc.querySelector('p.card-with-buttons__title');
	return titulo ? titulo.textContent.trim() : '';
}
