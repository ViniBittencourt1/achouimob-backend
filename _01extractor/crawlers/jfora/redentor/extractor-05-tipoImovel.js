import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Extrai o tipo de imóvel de um card HTML, normaliza-o usando um arquivo JSON
 * e retorna o slug correspondente.
 *
 * @param {string} cardHtml O HTML do card do imóvel.
 * @returns {string} O slug normalizado do tipo de imóvel ou uma string vazia se não for encontrado.
 */
export function extractTipoImovel(cardHtml) {
  // --- 1. Extração do tipo de imóvel do HTML ---
  const dom = new JSDOM(cardHtml);
  const tipoSpan = dom.window.document.querySelector('div.imovel-item--tipo span');
  let tipoExtraido = '';

  if (tipoSpan) {
    // Pega o conteúdo de texto do span, remove espaços em branco no início e no fim.
    const txt = tipoSpan.textContent.trim();
    // Usa uma expressão regular para extrair apenas a primeira palavra (antes de um espaço ou de uma barra).
    // Ex: "Apartamento / Padrão" -> "Apartamento"
    const match = txt.match(/^[^ \/]+/);
    tipoExtraido = match ? match[0] : '';
  }

  // Se nada foi extraído do HTML, não há o que normalizar. Retorna vazio.
  if (!tipoExtraido) {
    return '';
  }

  // --- 2. Carregamento e Normalização usando o arquivo JSON ---

  // Obtém o caminho absoluto do diretório do arquivo atual.
  // Essencial para que `fs` encontre o arquivo JSON independentemente de onde o script é executado.
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // Monta o caminho completo para o arquivo JSON.
  // ATENÇÃO: O caminho '../../../../crawler/_brTipoImovel.json' deve estar correto
  // em relação à localização deste arquivo no seu projeto.
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
    // Lê o arquivo JSON de forma síncrona.
    const jsonData = fs.readFileSync(tiposPath, 'utf8');
    // Converte o conteúdo do arquivo (string) para um objeto/array JavaScript.
    const tiposJson = JSON.parse(jsonData);
    tiposList = collectTipos(tiposJson);
    if (!Array.isArray(tiposList) || tiposList.length === 0) {
      console.error('Nenhum tipo encontrado no JSON!');
      return '';
    }
  } catch (e) {
    // Se houver um erro (arquivo não existe, JSON inválido), loga o erro e continua com uma lista vazia.
    console.error(`Erro ao carregar ou processar o arquivo _brTipoImovel.json: ${e.message}`);
    // Retorna vazio, pois a normalização não pode ser feita sem a lista.
    return '';
  }

  // --- 3. Lógica de Correspondência e Retorno do Slug ---

  // Itera sobre cada objeto (ex: { nome: 'Apartamento', slug: 'apartamento' }) da lista.
  for (const tipo of tiposList) {
    // Verifica se o `tipoExtraido` do HTML (em minúsculas) contém o `nome` do tipo do JSON (em minúsculas).
    // Ex: "apartamento".includes("apartamento") -> true
    // A função `includes` oferece flexibilidade. Ex: "casacondominio" conteria "casa".
    if (tipo.nome && tipoExtraido.toLowerCase().includes(tipo.nome.toLowerCase())) {
      // Se encontrou uma correspondência, retorna o 'slug' associado.
      return tipo.slug || ''; // Usa `|| ''` como segurança, caso o slug seja nulo.
    }
  }

  // Se o loop terminar e nenhuma correspondência for encontrada, retorna o valor extraído em letras maiúsculas.
  return tipoExtraido.toUpperCase();
}
