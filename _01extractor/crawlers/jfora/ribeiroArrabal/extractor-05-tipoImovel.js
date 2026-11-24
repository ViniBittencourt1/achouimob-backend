import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Extrai o campo tipoImovel de um card HTML e aplica validação/normalização
// cardHtml: string (HTML do card)
// Retorna o slug normalizado ou uma string vazia
export function extractTipoImovel(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const tipoSpan = dom.window.document.querySelector('div.imovel-item--tipo span');
  let tipoExtraido = '';

  if (tipoSpan) {
    // Extrai só o valor antes de espaço ou barra
    const txt = tipoSpan.textContent.trim();
    const match = txt.match(/^[^ \/]+/);
    tipoExtraido = match ? match[0] : '';
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
  let tiposList = [];
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const tiposPath = path.resolve(__dirname, '../../../../_03database/filtros/_brTipoImovel.json');
    const tiposJson = JSON.parse(fs.readFileSync(tiposPath, 'utf8'));
    tiposList = collectTipos(tiposJson);
  } catch (e) {
    tiposList = [];
  }
  for (const tipo of tiposList) {
    if (tipoExtraido && tipoExtraido.toLowerCase().includes(tipo.nome.toLowerCase())) {
      return tipo.slug || '';
    }
  }
  // Se não encontrar, retorna o valor extraído em maiúsculas
  return tipoExtraido ? tipoExtraido.toUpperCase() : '';
}
