import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';
// Extrai o tipo do imóvel a partir do card HTML
// cardHtml: string (HTML do card)
export function extractTipoImovel(cardHtml) {
	const dom = new JSDOM(cardHtml);
	const doc = dom.window.document;
	const tipo = doc.querySelector('p.card-with-buttons__title');
	const tipoTxt = tipo ? tipo.textContent.trim() : '';
	if (!tipoTxt) return 'apartamento';
	// Extrai a primeira palavra
	let primeira = tipoTxt.split(/\s+/)[0] || '';
	// Normaliza: remove acentos, minúsculo, remove pontuação isolada
	let primeiraNorm = primeira.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[.,-]/g, '').trim();
	if (!primeiraNorm) primeiraNorm = 'apartamento';

	// Busca no _brTipoImovel.json
	const tiposPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../_03database/filtros/_brTipoImovel.json');
	let tiposList = [];
	try {
		const tiposJson = JSON.parse(fs.readFileSync(tiposPath, 'utf8'));
		tiposList = collectTipos(tiposJson);
	} catch (e) {
		// Se não conseguir ler, retorna o valor em maiúsculas
		return primeiraNorm.toUpperCase();
	}
	for (const item of tiposList) {
		const nomeNorm = item.nome.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[.,-]/g, '').trim();
		if (primeiraNorm === nomeNorm) {
			return item.slug || item.nome;
		}
	}
	// Se não encontrar, retorna o valor procurado em maiúsculas (ou 'apartamento' se vazio)
	return primeiraNorm ? primeiraNorm.toUpperCase() : 'apartamento';
}

// Função recursiva para coletar todos os objetos com campo 'nome' em qualquer estrutura (array, objeto, mapa)
function collectTipos(obj) {
  let result = [];
  if (Array.isArray(obj)) {
    for (const item of obj) {
      result = result.concat(collectTipos(item));
    }
  } else if (obj && typeof obj === 'object') {
    if ('nome' in obj) result.push(obj);
    for (const key in obj) {
      result = result.concat(collectTipos(obj[key]));
    }
  }
  return result;
}
