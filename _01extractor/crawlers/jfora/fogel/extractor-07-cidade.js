import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Bloco de Configuração para ES Modules ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Carregamento Otimizado do JSON de Cidades ---
// O arquivo é lido e processado apenas uma vez na inicialização do módulo.
const cidadesPath = path.resolve(__dirname, '../../../../_03database/filtros/_brCidades.json');
let cidadesList = [];
try {
  const cidadesData = fs.readFileSync(cidadesPath, 'utf8');
  // Armazena a lista completa de objetos (com nome e slug).
  cidadesList = JSON.parse(cidadesData);
  console.log('✅ Arquivo de cidades carregado com sucesso!');
} catch (error) {
  // Log detalhado em caso de falha.
  console.error("❌ Erro ao carregar ou parsear o arquivo de cidades. Verifique o caminho:", error);
}

/**
 * Normaliza um texto removendo acentos e convertendo para minúsculas.
 * @param {string} text O texto a ser normalizado.
 * @returns {string} O texto normalizado.
 */
function normalizeText(text = '') {
    return text.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function normalizeCityNameForMatch(text = '') {
  return normalizeText(text)
    .replace(/[\/_,-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b(ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to)\b$/i, '')
    .trim();
}

/**
 * Extrai a cidade do HTML do card, valida contra a lista e retorna o slug.
 * @param {string} cardHtml O conteúdo HTML do card.
 * @returns {string} O slug da cidade (ex: "juiz-de-fora") ou uma string vazia.
 */
export function extractCidadeFromHtml(cardHtml) {
  // Retorna imediatamente se não houver HTML ou se a lista de cidades não foi carregada.
  if (!cardHtml || cidadesList.length === 0) {
    return '';
  }

  // 1. Extrai cidade no formato "Bairro, Cidade - UF" da Fogel.
  const fogelLocationMatch = cardHtml.match(/<p[^>]*search-feat-card__location[^>]*>\s*([^<]+)\s*<\/p>/i);
  let nomeCidadeExtraido = '';

  if (fogelLocationMatch?.[1]) {
    const texto = fogelLocationMatch[1].replace(/\s+/g, ' ').trim();
    const cidadeMatch = texto.match(/,\s*([^,-]+)\s*(?:-\s*[A-Z]{2})?$/i);
    if (cidadeMatch?.[1]) nomeCidadeExtraido = cidadeMatch[1].trim();
  }

  // 2. Extrai cidade pela segunda tag <b> em span.loc.
  const cidadeBoldMatch = cardHtml.match(/<span[^>]*class=["'][^"']*loc[^"']*["'][^>]*>[\s\S]*?<b>[^<]+<\/b>\s*\/\s*<b>([^<]+)<\/b>/i);

  if (!nomeCidadeExtraido && cidadeBoldMatch?.[1]) {
    nomeCidadeExtraido = cidadeBoldMatch[1].replace(/\s*-\s*[A-Z]{2}\s*$/i, '').trim();
  }

  // 3. Fallback por texto no bloco de localização.
  if (!nomeCidadeExtraido) {
    const localMatch = cardHtml.match(/<span[^>]*class=["'][^"']*loc[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
    const textoLocalizacao = localMatch?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '';
    const cidadeMatch = textoLocalizacao.match(/\/\s*([^\/-]+)(?:\s*-\s*[A-Z]{2})?\s*$/i);
    nomeCidadeExtraido = cidadeMatch ? cidadeMatch[1].trim() : '';
  }

  if (!nomeCidadeExtraido) {
    return '';
  }

  // 3. Normaliza o nome da cidade extraído para uma comparação robusta.
  const cidadeNormalizada = normalizeCityNameForMatch(nomeCidadeExtraido);

  if (cidadeNormalizada === 'juiz de fora') {
    return 'juiz-de-fora-mg';
  }

  // 4. Itera sobre a lista de cidades para encontrar uma correspondência exata.
  for (const cidade of cidadesList) {
    const nomeCidadeDaListaNormalizado = normalizeCityNameForMatch(cidade.nome);

    // Comparação exata (===) é mais segura aqui.
    if (cidade.nome && cidadeNormalizada === nomeCidadeDaListaNormalizado) {
      // CORREÇÃO PRINCIPAL: Retorna o SLUG da cidade validada.
      return cidade.slug;
    }
  }

  // Se a cidade extraída não foi encontrada na lista, retorna o valor extraído em letras maiúsculas.
  return nomeCidadeExtraido.toUpperCase();
}
