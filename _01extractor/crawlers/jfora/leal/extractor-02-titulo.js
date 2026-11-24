import { JSDOM } from 'jsdom';
// Extrai o título a partir do card da Leal.
export function extractTitulo(cardHtml) {
	const doc = JSDOM.fragment(cardHtml);
	const titulo = doc.querySelector('h3.card-text');
	return titulo ? titulo.textContent.trim() : '';
}
