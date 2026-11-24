import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Extrai o tipo de imóvel de um card HTML (de um <p>), o normaliza usando um arquivo JSON
 * e retorna o slug correspondente.
 *
 * @param {string} cardHtml O HTML do card do imóvel.
 * @returns {string} O slug normalizado do tipo de imóvel ou uma string vazia se não for encontrado.
 */
export function extractTipoImovel(cardHtml) {
  // --- ETAPA 1: Extrair o texto do HTML (ajustado para o seletor do Remax) ---
  const dom = new JSDOM(cardHtml);
  // Busca pelo seletor do Remax
  const tipoP = dom.window.document.querySelector('p.MuiTypography-root.MuiTypography-body2.body2.secondary-text.text-align-left');

  if (!tipoP) {
    return '';
  }

  const tipoExtraido = tipoP.textContent.trim();
  if (!tipoExtraido) {
    return '';
  }

  // --- ETAPA 2: Integrar a verificação com o arquivo JSON ---
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const tiposPath = path.resolve(__dirname, '../../../../_03database/filtros/_brTipoImovel.json');
  let tiposList = [];
  try {
    const jsonData = fs.readFileSync(tiposPath, 'utf8');
    const tiposJson = JSON.parse(jsonData);
    tiposList = collectTipos(tiposJson);
    if (!Array.isArray(tiposList) || tiposList.length === 0) {
      console.error('Nenhum tipo encontrado no JSON!');
      return '';
    }
  } catch (e) {
    console.error(`Erro ao carregar ou processar o arquivo _brTipoImovel.json: ${e.message}`);
    return '';
  }

  for (const tipo of tiposList) {
    if (tipo.nome && tipoExtraido.toLowerCase().includes(tipo.nome.toLowerCase())) {
      return tipo.slug || '';
    }
  }

  // Se não encontrou no JSON, retorna o valor raspado em maiúsculas
  return tipoExtraido.toUpperCase();
}

// Função recursiva para coletar todos os objetos com campo 'nome' em arrays aninhados
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
