import { JSDOM } from 'jsdom';
// Extrai o título a partir do card no layout antigo.
export function extractTitulo(cardHtml) {
	const dom = new JSDOM(cardHtml);
	const doc = dom.window.document;
	const titulo = doc.querySelector('h3.card-text');
	return titulo ? titulo.textContent.trim() : '';
}
