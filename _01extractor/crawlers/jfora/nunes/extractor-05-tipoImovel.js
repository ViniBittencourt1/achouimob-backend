import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Extrai o tipo de imÃ³vel de um card HTML, o normaliza usando um arquivo JSON
 * e retorna o slug correspondente.
 *
 * @param {string} cardHtml O HTML do card do imÃ³vel.
 * @returns {string} O slug normalizado do tipo de imÃ³vel ou uma string vazia se nÃ£o for encontrado.
 */
export function extractTipoImovel(cardHtml) {
  // --- ETAPA 1: Extrair o texto do HTML ---
  const dom = new JSDOM(cardHtml);
  const tipoP = dom.window.document.querySelector('p.card-with-buttons__title');

  // Se o elemento nÃ£o for encontrado, nÃ£o hÃ¡ como prosseguir.
  if (!tipoP) {
    return '';
  }

  const tipoExtraido = tipoP.textContent.trim();

  // Se a extraÃ§Ã£o nÃ£o produzir um resultado, retorna vazio.
  if (!tipoExtraido) {
    return '';
  }

  // --- ETAPA 2: Integrar a verificaÃ§Ã£o com o arquivo JSON ---

  // Carrega a lista de tipos do arquivo JSON.
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // ATENÃ‡ÃƒO: Verifique se este caminho relativo estÃ¡ correto para a estrutura do seu projeto.
  const tiposPath = path.resolve(__dirname, '../../../../_03database/filtros/_brTipoImovel.json');

  let tiposList = [];
  try {
    // LÃª o arquivo e converte a string JSON para um array de objetos.
    const jsonData = fs.readFileSync(tiposPath, 'utf8');
    const tiposJson = JSON.parse(jsonData);
    tiposList = collectTipos(tiposJson);
  } catch (e) {
    console.error(`Erro ao carregar ou processar o arquivo _brTipoImovel.json: ${e.message}`);
    // Se o arquivo de normalizaÃ§Ã£o falhar, a funÃ§Ã£o nÃ£o pode completar sua tarefa.
    return '';
  }

  // --- ETAPA 3: Comparar e retornar o slug ---

  // Percorre a lista de tipos do JSON.
  for (const tipo of tiposList) {
    // Compara o valor extraÃ­do do HTML (em minÃºsculas) com os nomes na lista JSON (em minÃºsculas).
    // A lÃ³gica `includes` permite que "Apartamento com 2 quartos" corresponda a "Apartamento".
    if (tipo.nome && tipoExtraido.toLowerCase().includes(tipo.nome.toLowerCase())) {
      // Ao encontrar a primeira correspondÃªncia, retorna o slug associado.
      return tipo.slug || '';
    }
  }

  // Se o loop terminar sem encontrar nenhuma correspondÃªncia, retorna o valor extraÃ­do em letras maiÃºsculas.
  return tipoExtraido.toUpperCase();
}

// FunÃ§Ã£o recursiva para coletar todos os objetos com campo 'nome' em qualquer estrutura (array, objeto, mapa)
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
