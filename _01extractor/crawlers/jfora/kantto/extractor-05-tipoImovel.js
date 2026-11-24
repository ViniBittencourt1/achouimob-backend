import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Extrai o tipo de imóvel de um card HTML usando regex, o normaliza com um arquivo JSON
 * e retorna o slug correspondente.
 *
 * @param {string} cardHtml O HTML do card do imóvel como string.
 * @returns {string} O slug normalizado do tipo de imóvel ou uma string vazia se não for encontrado.
 */
export function extractTipoImovel(cardHtml) {
  // --- ETAPA 1: Extrair o texto do HTML usando Regex (lógica do seu código original) ---
  const matchKantto = cardHtml.match(/<span[^>]*class=["'][^"']*type[^"']*["'][^>]*>\s*([^<]+)\s*<\/span>/i);
  const tipoKantto = matchKantto?.[1]?.trim() || '';

  // A regex busca por "Casa · Venda", "Apartamento · Venda", etc.
  const match = cardHtml.match(/<p[^>]*search-feat-card__cat-trans[^>]*>[\s\S]*?<strong>\s*([^<]+)\s*<\/strong>/i);

  // `match[1]` contém o texto capturado pelo grupo `([^<]+)`.
  const tipoExtraido = tipoKantto || (match
    ? match[1].split('·')[0].replace(/\s+[-–]\s+.*/i, '').trim()
    : '');

  // Se a regex não encontrar uma correspondência, não há o que normalizar.
  if (!tipoExtraido) {
    return '';
  }

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

  // Percorre a lista de tipos do JSON.
  for (const tipo of tiposList) {
    // Compara o valor extraído do HTML (em minúsculas) com os nomes na lista JSON (em minúsculas).
    // A lógica `includes` permite que "Apartamento Padrão" corresponda a "Apartamento".
    if (tipo.nome && tipoExtraido.toLowerCase().includes(tipo.nome.toLowerCase())) {
      // Ao encontrar a primeira correspondência, retorna o slug associado.
      return tipo.slug || '';
    }
  }

  // Se o loop terminar sem encontrar nenhuma correspondência, retorna o valor extraído em letras maiúsculas.
  return tipoExtraido.toUpperCase();
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
