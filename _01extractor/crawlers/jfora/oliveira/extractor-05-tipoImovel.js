import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Extrai o tipo do imóvel do <h5 class="text-secondary hover-text-primary mb-2">
export function extractTipoImovel(cardHtml) {
  if (!cardHtml || typeof cardHtml !== 'string') return '';
  const match = cardHtml.match(/<h5[^>]*class\s*=\s*(["'])text-secondary hover-text-primary mb-2\1[^>]*>([\s\S]*?)<\/h5>/i);
  if (match) {
    let tipoExtraido = match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
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
      const tiposJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../_03database/filtros/_brTipoImovel.json'), 'utf8'));
      tiposList = collectTipos(tiposJson);
    } catch (e) {
      tiposList = [];
    }
    for (const tipo of tiposList) {
      if (tipoExtraido && tipoExtraido.toLowerCase().includes(tipo.nome.toLowerCase())) {
        return tipo.slug || '';
      }
    }
    return '';
  }
  return '';
}
