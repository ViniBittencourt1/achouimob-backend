import { resolverBairroCatalogo } from '../_utils/bairroCatalogo.js';

function extrairBairroDoLink(linkReal, cidade) {
	try {
		const titulo = new URL(linkReal).searchParams.get('tit') || '';
		const bairro = titulo.match(/-bairro-(.+?)-na-cidade-/i)?.[1] || '';
		return bairro ? resolverBairroCatalogo(bairro, cidade) : '';
	} catch {
		return '';
	}
}

// Extrai o bairro a partir do cardNode, usando a mesma lógica do extractLocalizacao
// cardNode: cheerio node
export function extractBairro(cardNode, cidade = '', linkReal = '') {
	const bairroDoLink = extrairBairroDoLink(linkReal, cidade);
	if (bairroDoLink) return bairroDoLink;

	const texto = cardNode.find("a[href*='properties-details']").text().trim() || "";
	if (!texto) return "";

	const partes = texto.split(',').map((p) => p.trim()).filter(Boolean);
	const bairro = partes.length > 0 ? partes[0] : texto;
	if (!bairro) return '';

	const slugResolvido = resolverBairroCatalogo(bairro, cidade);
	if (slugResolvido) return slugResolvido;

	return extrairBairroDoLink(linkReal, cidade);
}
