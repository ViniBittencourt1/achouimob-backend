
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Corrige __dirname para ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Extrai o campo tipoImovel de um card HTML e aplica validação/normalização
// cardHtml: string (HTML do card)
// Retorna o slug normalizado ou uma string vazia
export function collectTipos(obj) {
  let result = [];
  if (Array.isArray(obj)) {
    for (const item of obj) result = result.concat(collectTipos(item));
  } else if (obj && typeof obj === 'object') {
    if ('nome' in obj) result.push(obj);
    for (const key in obj) result = result.concat(collectTipos(obj[key]));
  }
  return result;
}

export function extractTipoImovel(cardHtml, tiposInformados) {
  const dom = new JSDOM(cardHtml);
  const tipoSpan = dom.window.document.querySelector('div.imovel-item--tipo span');
  let tipoExtraido = '';

  if (tipoSpan) {
    // Extrai só o valor antes de espaço ou barra
    const txt = tipoSpan.textContent.trim();
    const match = txt.match(/^[^ \/]+/);
    tipoExtraido = match ? match[0] : '';
  }

  let tiposList = [];
  const tiposPath = path.resolve(__dirname, '../../../../_03database/filtros/_brTipoImovel.json');
  if (tiposInformados !== undefined) {
    tiposList = collectTipos(tiposInformados);
  } else {
    try {
      const tiposJson = JSON.parse(fs.readFileSync(tiposPath, 'utf8'));
      tiposList = collectTipos(tiposJson);
    } catch (e) {
      tiposList = [];
    }
  }
  for (const tipo of tiposList) {
    if (tipoExtraido && tipoExtraido.toLowerCase().includes(tipo.nome.toLowerCase())) {
      return tipo.slug || '';
    }
  }
  // Se não encontrar, retorna o valor extraído em maiúsculas
  return tipoExtraido ? tipoExtraido.toUpperCase() : '';
}
