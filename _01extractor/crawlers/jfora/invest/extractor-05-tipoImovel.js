import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Extrai o tipo de imóvel de um card HTML, o normaliza usando um arquivo JSON
 * e retorna o slug correspondente.
 *
 * @param {string} cardHtml O HTML do card do imóvel.
 * @returns {string} O slug normalizado do tipo de imóvel ou uma string vazia se não for encontrado.
 */
export function extractTipoImovel(cardHtml) {
  const dom = new JSDOM(cardHtml);
  // Priorizando a extração do span, como no segundo exemplo, por ser mais robusta.
  // Se o span não for encontrado, tenta o alt text da imagem como fallback.
  let tipoExtraido = '';
  const tipoSpan = dom.window.document.querySelector('div.imovel-item--tipo span');

  if (tipoSpan) {
    const txt = tipoSpan.textContent.trim();
      // Regex para pegar a primeira palavra, ignorando espaços e barras
      const match = txt.match(/^[^\s\/]+/);
    tipoExtraido = match ? match[0] : '';
  } else {
    // Fallback para o alt text da imagem, se o span não for encontrado
    const imgNode = dom.window.document.querySelector('img[alt]');
    if (imgNode) {
      const altText = imgNode.getAttribute('alt') || '';
      const match = altText.match(/^([A-Za-zÀ-ú]+)/);
      tipoExtraido = match ? match[1] : '';
    }
  }

  if (!tipoExtraido) {
    return '';
  }

  // Carrega a lista de tipos do arquivo JSON.
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // Caminho correto para backend/_03database/filtros/_brTipoImovel.json
  const tiposPath = path.resolve(__dirname, '../../../../_03database/filtros/_brTipoImovel.json');

  let tiposList = [];
  try {
    const jsonData = fs.readFileSync(tiposPath, 'utf8');
    const tiposJson = JSON.parse(jsonData);
    tiposList = collectTipos(tiposJson);
  } catch (e) {
    console.error(`Erro ao carregar ou processar o arquivo _brTipoImovel.json: ${e.message}`);
    return '';
  }

  for (const tipo of tiposList) {
    if (tipo.nome && tipoExtraido.toLowerCase().includes(tipo.nome.toLowerCase())) {
      return tipo.slug || '';
    }
  }

  return tipoExtraido.toUpperCase();
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
