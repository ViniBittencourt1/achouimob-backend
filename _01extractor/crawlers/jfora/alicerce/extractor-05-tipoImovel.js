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
export function extractTipoImovel(cardHtml, tiposInformados) {
  // --- ETAPA 1: Extrair o texto do HTML (lógica do seu código original) ---
  const doc = JSDOM.fragment(cardHtml);
  const tipoSpan = doc.querySelector('div.imovel-item--tipo span');

  // Se o elemento <span> não for encontrado, não há como prosseguir.
  if (!tipoSpan) {
    return '';
  }

  // Extrai o conteúdo de texto e pega apenas a primeira palavra (antes de um espaço ou barra).
  const txt = tipoSpan.textContent.trim();
  const match = txt.match(/^[^\s\/]+/);
  const tipoExtraido = match ? match[0] : '';

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

  let tiposList = [];
  try {
    const tiposJson = tiposInformados === undefined ? JSON.parse(fs.readFileSync(tiposPath, 'utf8')) : tiposInformados;
    tiposList = collectTipos(tiposJson);
    if (!Array.isArray(tiposList) || tiposList.length === 0) {
      console.error('Nenhum tipo encontrado no JSON!');
      return '';
    }
  } catch (e) {
    console.error(`Erro ao carregar ou processar o arquivo _brTipoImovel.json: ${e.message}`);
    return '';
  }

  // --- ETAPA 3: Comparar e retornar o slug ---

  // Percorre a lista de tipos do JSON.
  for (const tipo of tiposList) {
    // Compara o valor extraído do HTML (em minúsculas) com os nomes na lista JSON (em minúsculas).
    if (tipo.nome && tipoExtraido.toLowerCase().includes(tipo.nome.toLowerCase())) {
      // Ao encontrar a primeira correspondência, retorna o slug associado.
      return tipo.slug || '';
    }
  }

  // Se o loop terminar sem encontrar nenhuma correspondência, retorna o valor extraído em maiúsculas.
  return tipoExtraido.toUpperCase();
}
