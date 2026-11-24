import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolverBairroCatalogo } from '../_utils/bairroCatalogo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega a lista de bairros válidos
const bairrosPath = path.resolve(__dirname, '../../../../_03database/filtros/_jfBairros.json');
let bairrosList = [];
try {
	bairrosList = JSON.parse(fs.readFileSync(bairrosPath, 'utf8'));
} catch (e) {
	bairrosList = [];
}
// Export padrão para compatibilidade
export const extractBairro = extractLocalizacao;
import { JSDOM } from 'jsdom';
// Extrai o campo localizacao de um card HTML
// cardHtml: string (HTML do card)
export function extractLocalizacao(cardHtml, cidade = '') {
	const dom = new JSDOM(cardHtml);
	const h2Loc = dom.window.document.querySelector('h2.card-title');
	let valor = h2Loc ? h2Loc.textContent.trim() : '';
	if (valor.includes('-')) {
		// Se houver '-', extrai o valor antes dele
		valor = valor.split('-')[0].trim();
	}
	// Normaliza para busca
	const valorNorm = valor.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
	for (const bairro of bairrosList) {
		if (bairro.nome && bairro.nome.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim() === valorNorm) {
			return bairro.slug;
		}
	}
	// Se não encontrar, retorna o valor em maiúsculas
	return resolverBairroCatalogo(valor, cidade);
}
