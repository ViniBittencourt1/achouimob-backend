import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Extrai o tipo de imóvel de um card HTML usando regex, o normaliza com um arquivo JSON
 * e retorna o slug correspondente.
 *
 * @param {string} cardHtml O HTML do card do imóvel como string.
 * @param {string} linkReal URL do imóvel, usada como fallback.
 * @returns {string} O slug normalizado do tipo de imóvel ou uma string vazia se não for encontrado.
 */
export function extractTipoImovel(cardHtml, linkReal = '') {
  // --- ETAPA 1: Extrair o texto do HTML usando Regex (lógica do seu código original) ---

  // A regex busca pelo padrão: <p class="imovelcard__info__ref">...<strong>...</strong> - TEXTO_A_SER_EXTRAÍDO</p>
  const match = cardHtml?.match(/<p class="imovelcard__info__ref">.*?<strong>.*?<\/strong>\s*-\s*([^<]+)<\/p>/i);

  // `match[1]` contém o texto capturado pelo grupo `([^<]+)`.
  const tipoDoHtml = match ? match[1].trim() : '';
  const tipoDoLink = extractTipoFromLinkReal(linkReal);

  // --- ETAPA 2: Integrar a verificação com o arquivo JSON ---

  // Carrega a lista de tipos do arquivo JSON.
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // Caminho correto para o arquivo de tipos de imóvel
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

  const normalizarTipo = (tipoExtraido) => {
    if (!tipoExtraido) return '';
    for (const tipo of tiposList) {
      if (tipo.nome && tipoExtraido.toLowerCase().includes(tipo.nome.toLowerCase())) {
        return tipo.slug || '';
      }
    }
    return '';
  };

  const tipoNormalizadoDoLink = normalizarTipo(tipoDoLink);
  if (tipoNormalizadoDoLink) return tipoNormalizadoDoLink;

  const tipoNormalizadoDoHtml = normalizarTipo(tipoDoHtml);
  if (tipoNormalizadoDoHtml) return tipoNormalizadoDoHtml;

  return (tipoDoHtml || tipoDoLink).toUpperCase();
}

function extractTipoFromLinkReal(linkReal) {
  try {
    const pathname = new URL(linkReal).pathname;
    const slug = pathname.match(/\/imovel\/([^/]+)\/(?:venda|locacao|venda-e-locacao)\//i)?.[1]
      || pathname.match(/\/imovel\/\d+\/([a-z0-9-]+?)-(?:venda|aluguel|locacao)-/i)?.[1] || '';
    return slug.replace(/-/g, ' ').trim();
  } catch {
    return '';
  }
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
