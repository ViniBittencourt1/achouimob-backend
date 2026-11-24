import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Bloco de Configuração para ES Modules ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Carregamento Otimizado do JSON de Cidades ---
// O arquivo é lido apenas uma vez na inicialização do módulo.
const cidadesPath = path.resolve(__dirname, '../../../../_03database/filtros/_brCidades.json');
let cidadesList = [];
try {
  const cidadesData = fs.readFileSync(cidadesPath, 'utf8');
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

/**
 * Função principal que extrai o nome da cidade de um breadcrumb,
 * valida contra a lista de cidades e retorna o slug correspondente.
 *
 * @param {string} cardHtml O conteúdo HTML a ser processado.
 * @returns {string} O slug da cidade (ex: "juiz-de-fora") ou uma string vazia.
 */
export function extractCidadeFromCardHtml(cardHtml) {
  // Retorna imediatamente se não houver HTML ou se a lista de cidades não foi carregada.
  if (!cardHtml || cidadesList.length === 0) {
    return '';
  }

  let nomeCidadeExtraido = '';
  try {
    // 1. Extrai o nome da cidade do breadcrumb usando JSDOM.
    const dom = new JSDOM(cardHtml);
    const breadcrumb = dom.window.document.querySelectorAll('.breadcrumb li');
    if (breadcrumb && breadcrumb.length >= 2) {
      const span = breadcrumb[1].querySelector("span[itemprop='name']");
      if (span) {
        nomeCidadeExtraido = span.textContent.trim();
      }
    }
  } catch (error) {
    console.error("Erro ao processar o HTML com JSDOM:", error);
    return ''; // Retorna vazio se houver erro no parsing do HTML.
  }

  if (!nomeCidadeExtraido) {
    return ''; // Retorna vazio se não encontrou o nome da cidade no HTML.
  }

  // 2. Normaliza o nome da cidade extraído para a comparação.
  const cidadeNormalizada = normalizeText(nomeCidadeExtraido);

  // 3. Prioriza cidades cujo nome contém 'juiz de fora' ou 'juiz-de-fora'
  const cidadesPrioridade = cidadesList.filter(cidade => {
    const nomeNorm = normalizeText(cidade.nome);
    return nomeNorm.includes('juiz de fora') || nomeNorm.includes('juiz-de-fora');
  });

  // Busca exata entre nome da cidade e cidadeNormalizada (prioridade)
  for (const cidade of cidadesPrioridade) {
    const nomeCidadeDaListaNormalizado = normalizeText(cidade.nome);
    if (cidadeNormalizada === nomeCidadeDaListaNormalizado) {
      return cidade.slug;
    }
  }

  // Busca exata entre nome da cidade e cidadeNormalizada (todas cidades)
  for (const cidade of cidadesList) {
    const nomeCidadeDaListaNormalizado = normalizeText(cidade.nome);
    if (cidadeNormalizada === nomeCidadeDaListaNormalizado) {
      return cidade.slug;
    }
  }

  // Busca por includes (prioridade juiz de fora)
  for (const cidade of cidadesPrioridade) {
    const nomeCidadeDaListaNormalizado = normalizeText(cidade.nome);
    if (cidadeNormalizada.includes(nomeCidadeDaListaNormalizado) || nomeCidadeDaListaNormalizado.includes(cidadeNormalizada)) {
      return cidade.slug;
    }
  }

  // Busca por includes (todas cidades)
  for (const cidade of cidadesList) {
    const nomeCidadeDaListaNormalizado = normalizeText(cidade.nome);
    if (cidadeNormalizada.includes(nomeCidadeDaListaNormalizado) || nomeCidadeDaListaNormalizado.includes(cidadeNormalizada)) {
      return cidade.slug;
    }
  }

  // Se a cidade extraída não foi encontrada na lista, retorna o valor extraído em letras maiúsculas.
  return nomeCidadeExtraido.toUpperCase();
}

// --- Exportações para Compatibilidade ---
export const extractCidade = extractCidadeFromCardHtml;
export const extractCidadeFromTituloEm = extractCidadeFromCardHtml;
