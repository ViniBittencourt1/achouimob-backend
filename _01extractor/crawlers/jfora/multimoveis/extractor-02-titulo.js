import { JSDOM } from 'jsdom';
// Extrai o tÃ­tulo a partir do card da Leal.
export function extractTitulo(cardHtml) {
	const dom = new JSDOM(cardHtml);
	const doc = dom.window.document;
	const titulo = doc.querySelector('h3.card-text');
	return titulo ? titulo.textContent.trim() : '';
}
