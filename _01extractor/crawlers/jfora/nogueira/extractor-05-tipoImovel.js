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
  // --- Parte 1: Extração do HTML (código original) ---
  const dom = new JSDOM(cardHtml);
  const tipoSpan = dom.window.document.querySelector('div.imovel-item--tipo span');

  if (!tipoSpan) {
    return ''; // Se o elemento <span> não existe, não há o que fazer.
  }

  // Extrai só o valor antes de espaço ou barra.
  const txt = tipoSpan.textContent.trim();
  const match = txt.match(/^[^\s\/]+/);
  const tipoExtraido = match ? match[0] : '';

  // Se a extração não resultar em um valor, retorna vazio.
  if (!tipoExtraido) {
    return '';
  }

  // --- Parte 2: Lógica de verificação e normalização com JSON (integrada) ---

  // Carrega a lista de tipos do arquivo JSON.
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // IMPORTANTE: Verifique se este caminho relativo está correto para a estrutura do seu projeto.
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
    const jsonData = fs.readFileSync(tiposPath, 'utf8');
    const tiposJson = JSON.parse(jsonData);
    tiposList = collectTipos(tiposJson);
    if (!Array.isArray(tiposList) || tiposList.length === 0) {
      console.error('Nenhum tipo encontrado no JSON!');
      return '';
    }
  } catch (e) {
    console.error(`Erro ao carregar ou processar o arquivo _brTipoImovel.json: ${e.message}`);
    // Se o arquivo de normalização falhar, não podemos continuar.
    return '';
  }

  // Itera sobre a lista para encontrar uma correspondência.
  for (const tipo of tiposList) {
    // Compara o valor extraído do HTML com os nomes na lista JSON.
    if (tipo.nome && tipoExtraido.toLowerCase().includes(tipo.nome.toLowerCase())) {
      // Se encontrar, retorna o slug correspondente.
      return tipo.slug || '';
    }
  }

  // Se o loop terminar sem encontrar uma correspondência, retorna o valor extraído em letras maiúsculas.
  return tipoExtraido.toUpperCase();
}
