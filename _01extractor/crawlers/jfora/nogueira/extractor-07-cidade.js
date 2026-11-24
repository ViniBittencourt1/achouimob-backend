// Exporta também como extractCidadeFromTituloEm para compatibilidade
export const extractCidadeFromTituloEm = extractCidade;
// Exporta também como extractCidadeFromCardHtml para compatibilidade
export const extractCidadeFromCardHtml = extractCidade;
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cidadesPath = path.resolve(__dirname, '../../../../_03database/filtros/_brCidades.json');
let cidadesList = [];
try {
	cidadesList = JSON.parse(fs.readFileSync(cidadesPath, 'utf8'));
} catch (e) {
	cidadesList = [];
}

// Extrai o campo cidade de um card HTML
// cardHtml: string (HTML do card)
export function extractCidade(cardHtml) {
	const dom = new JSDOM(cardHtml);
	const divLoc = dom.window.document.querySelector('div.imovel-item--localizacao');
	if (!divLoc) return '';
	const texto = divLoc.textContent.trim();
	// Extrai o valor entre duas vírgulas
	const partes = texto.split(',');
	let procurado = '';
	if (partes.length >= 3) {
		procurado = partes[1].trim();
	} else {
		procurado = '';
	}
	// Busca no JSON de cidades
	const procuradoNorm = procurado.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
	for (const cidade of cidadesList) {
		const nomeNorm = cidade.nome.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
		if (nomeNorm === procuradoNorm) {
			return cidade.slug || cidade.nome;
		}
	}
	// Se não encontrar, retorna o valor procurado em maiúsculas
	return procurado.toUpperCase();
}
