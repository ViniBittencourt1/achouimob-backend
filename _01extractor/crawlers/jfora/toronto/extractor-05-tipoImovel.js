import { JSDOM } from '../_utils/cachedJSDOM.js';
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
  // --- ETAPA 1: Extrair o texto do HTML (lógica do seu novo código) ---
  const dom = new JSDOM(cardHtml);
  // A busca agora é pelo seletor 'p.card_split_vertically__type'.
  const tipoP = dom.window.document.querySelector('p.card_split_vertically__type');

  // Se o elemento <p> não for encontrado, não há como prosseguir.
  if (!tipoP) {
    return '';
  }

  // Extrai todo o conteúdo de texto do parágrafo e remove espaços extras.
  const tipoExtraido = tipoP.textContent.trim();

  // Se a extração não produzir um resultado, retorna vazio.
  if (!tipoExtraido) {
    return '';
  }

  // --- ETAPA 2: Integrar a verificação com o arquivo JSON ---

  // Carrega a lista de tipos do arquivo JSON.
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // ATENÇÃO: Verifique se este caminho relativo está correto para a estrutura do seu projeto.
  const tiposPath = path.resolve(__dirname, '../../../../_03database/filtros/_brTipoImovel.json');

  let tiposList = [];
  try {
    // Lê o arquivo e converte a string JSON para um array de objetos.
    const jsonData = fs.readFileSync(tiposPath, 'utf8');
    const tiposJson = JSON.parse(jsonData);
    tiposList = collectTipos(tiposJson);
  } catch (e) {
    console.error(`Erro ao carregar ou processar o arquivo _brTipoImovel.json: ${e.message}`);
    // Se o arquivo de normalização falhar, a função não pode completar sua tarefa.
    return '';
  }

  // --- ETAPA 3: Comparar e retornar o slug ---

  // Percorre a lista de tipos do JSON.
  for (const tipo of tiposList) {
    // Compara o valor extraído do HTML (em minúsculas) com os nomes na lista JSON (em minúsculas).
    // A lógica `includes` permite que "Apartamento na planta" corresponda a "Apartamento".
    if (tipo.nome && tipoExtraido.toLowerCase().includes(tipo.nome.toLowerCase())) {
      // Ao encontrar a primeira correspondência, retorna o slug associado.
      return tipo.slug || '';
    }
  }

  // Se não encontrar, retorna o valor extraído em maiúsculas
  return tipoExtraido ? tipoExtraido.toUpperCase() : '';
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
