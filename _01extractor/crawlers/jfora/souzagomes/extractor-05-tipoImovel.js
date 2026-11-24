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
  let tipoExtraido = '';

  // Extração baseada na classe .imovel-item--cod
  const codDiv = dom.window.document.querySelector('.imovel-item--cod');
  if (codDiv) {
    const codText = codDiv.textContent.trim();
    const matchCod = codText.match(/\/\s*(.*)/);
    const parteCod = matchCod ? matchCod[1].trim() : '';
    tipoExtraido = parteCod.split(/\s+/)[0] || '';
  }

  if (!tipoExtraido) {
    return '';
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
  // Carrega a lista de tipos do arquivo JSON.
  // Caminho fixo para backend/crawler/_brTipoImovel.json
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
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
  // Se não encontrar, retorna o valor extraído em maiúsculas
  return tipoExtraido ? tipoExtraido.toUpperCase() : '';
}