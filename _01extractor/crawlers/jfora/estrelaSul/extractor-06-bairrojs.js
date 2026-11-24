import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// Extrai o campo localizacao de um card HTML
// cardHtml: string (HTML do card)
function normalizeText(value = '') {
	return String(value)
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

export function extractBairro(cardHtml, cidade = '') {
	const dom = new JSDOM(cardHtml);
	const h2Loc = dom.window.document.querySelector('h2.card-with-buttons__heading');
	const localizacao = h2Loc ? h2Loc.textContent.trim() : '';
	if (!localizacao) return '';

	// Extrai o valor antes de "-"
	const partes = localizacao.split('-').map(p => p.trim()).filter(Boolean);
	let bairro = partes.length > 0 ? partes[0] : localizacao;
	// Normaliza: remove acentos, lowercase, remove pontuação isolada e espaços extras
	const bairroNormalizado = normalizeText(bairro);

	// Busca no jfBairros.json
	const bairrosPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../../_03database/filtros/_jfBairros.json');
	let bairrosList = [];
	try {
		bairrosList = JSON.parse(fs.readFileSync(bairrosPath, 'utf8'));
	} catch (e) {
		// Se não conseguir ler, retorna o valor em maiúsculas
		return bairroNormalizado.toUpperCase();
	}
	for (const item of bairrosList) {
		const nomeNorm = normalizeText(item.nome);
		if ((!cidade || item.cidade === cidade) &&
			(bairroNormalizado === nomeNorm || bairroNormalizado === normalizeText(item.slug))) {
			return item.slug || item.nome;
		}
	}
	// Se não encontrar, retorna o valor encontrado em maiúsculas
	return '';
}
