import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega a lista de bairros vÃ¡lidos
const bairrosPath = path.resolve(__dirname, '../../../../_03database/filtros/_jfBairros.json');
let bairrosList = [];
try {
	bairrosList = JSON.parse(fs.readFileSync(bairrosPath, 'utf8'));
} catch (e) {
	bairrosList = [];
}
// Export padrÃ£o para compatibilidade
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
	const cidadeSlug = String(cidade || '').trim();
	const bairrosFiltrados = cidadeSlug
		? bairrosList.filter((bairro) => String(bairro?.cidade || '').trim() === cidadeSlug)
		: bairrosList;
	const matches = [];
	for (const bairro of bairrosFiltrados) {
		if (bairro.nome && bairro.slug && bairro.nome.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim() === valorNorm) {
			matches.push({
				slug: bairro.slug,
				principal: String(bairro.principal || 'sim').trim().toLowerCase() === 'sim'
			});
		}
	}
	if (matches.length) {
		matches.sort((a, b) => Number(b.principal) - Number(a.principal));
		return matches[0].slug;
	}
	// Se nÃ£o encontrar, retorna o valor em maiÃºsculas
	return valor.toUpperCase();
}
