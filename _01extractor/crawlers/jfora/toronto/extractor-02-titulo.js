import { JSDOM } from '../_utils/cachedJSDOM.js';

// Extrai o título no formato: "Casa Cascatinha - Juiz de Fora - MG"
export function extractTitulo(cardHtml) {
	const dom = new JSDOM(cardHtml);
	const doc = dom.window.document;
	const tipo = doc.querySelector('p.card_split_vertically__type');
	const local = doc.querySelector('h2.card_split_vertically__location');
	const tipoTxt = tipo ? tipo.textContent.trim() : '';
	const localTxt = local ? local.textContent.trim() : '';
	if (tipoTxt && localTxt) return `${tipoTxt} ${localTxt}`;
	return tipoTxt || localTxt || '';
}
