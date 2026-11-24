import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Bloco de ConfiguraÃ§Ã£o para ES Modules ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Carregamento Otimizado do JSON de Cidades ---
// O arquivo Ã© lido e processado apenas uma vez na inicializaÃ§Ã£o do mÃ³dulo.
const cidadesPath = path.resolve(__dirname, '../../../../_03database/filtros/_brCidades.json');
let cidadesList = [];
try {
  const cidadesData = fs.readFileSync(cidadesPath, 'utf8');
  // Armazena a lista completa de objetos (com nome e slug).
  cidadesList = JSON.parse(cidadesData);
  console.log('âœ… Arquivo de cidades carregado com sucesso!');
} catch (error) {
  // O catch jÃ¡ lida com o erro de arquivo nÃ£o encontrado, entÃ£o fs.existsSync Ã© redundante.
  console.error("âŒ Erro ao carregar ou parsear o arquivo de cidades. Verifique o caminho:", error);
}

/**
 * Normaliza um texto removendo acentos e convertendo para minÃºsculas.
 * @param {string} text O texto a ser normalizado.
 * @returns {string} O texto normalizado.
 */
function normalizeText(text = '') {
    return text.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

/**
 * FunÃ§Ã£o principal que extrai a cidade do titulo do card,
 * valida contra la lista de cidades e retorna o slug correspondente.
 *
 * @param {string} cardHtml O conteÃºdo HTML a ser processado.
 * @returns {string} O slug da cidade (ex: "juiz-de-fora") ou uma string vazia.
 */
export function extractCidadeFromCardHtml(cardHtml) {
  // Retorna imediatamente se nÃ£o houver HTML ou se a lista de cidades nÃ£o foi carregada.
  if (!cardHtml || cidadesList.length === 0) {
    return '';
  }

  // 1. Extrai o texto do titulo do card usando RegExp.
  const regex = /<h3 class="card-text">([^<]*)<\/h3>/i;
  const match = cardHtml.match(regex);
  if (!match || !match[1]) {
    return '';
  }

  // 2. Extrai a parte que corresponde Ã  cidade, sempre apÃ³s "em".
  const titulo = match[1].trim();
  const partes = titulo.split(/\bem\b/i).map((s) => s.trim()).filter(Boolean);
  const nomeCidadeExtraido = partes.length >= 2 ? partes[partes.length - 1] : '';
  if (!nomeCidadeExtraido) {
    return '';
  }

  // 3. Normaliza o nome da cidade extraÃ­do *uma Ãºnica vez*.
  const cidadeNormalizada = normalizeText(nomeCidadeExtraido);

  // 4. Itera sobre a lista de cidades para encontrar uma correspondÃªncia exata.
  for (const cidade of cidadesList) {
    const nomeCidadeDaListaNormalizado = normalizeText(cidade.nome);

    // ComparaÃ§Ã£o exata (===) para maior precisÃ£o.
    if (cidade.nome && cidadeNormalizada === nomeCidadeDaListaNormalizado) {
      // CORREÃ‡ÃƒO PRINCIPAL: Retorna o SLUG da cidade validada.
      return cidade.slug;
    }
  }

  // Se a cidade extraÃ­da nÃ£o foi encontrada na lista, retorna o valor extraÃ­do em letras maiÃºsculas.
  return nomeCidadeExtraido.toUpperCase();
}

// --- ExportaÃ§Ãµes para Compatibilidade ---
export const extractCidade = extractCidadeFromCardHtml;
export const extractCidadeFromTituloEm = extractCidadeFromCardHtml;
