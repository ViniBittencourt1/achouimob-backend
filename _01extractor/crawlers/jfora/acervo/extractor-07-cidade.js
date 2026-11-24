import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Bloco de Configuração para ES Modules ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Carregamento do JSON de Cidades ---
// Usando o caminho que você confirmou ser o correto no contexto original.
const cidadesPath = path.resolve(__dirname, '../../../../_03database/filtros/_brCidades.json');
let cidadesList = [];
try {
  const cidadesData = fs.readFileSync(cidadesPath, 'utf8');
  cidadesList = JSON.parse(cidadesData);
  console.log('✅ Arquivo de cidades carregado com sucesso!');
} catch (error) {
  console.error("❌ Erro ao carregar ou parsear o arquivo de cidades. Verifique o caminho:", error);
}

/**
 * Função principal que extrai o nome da cidade do HTML,
 * encontra o slug correspondente na lista de cidades e o retorna.
 *
 * @param {string} cardHtml O conteúdo HTML a ser processado.
 * @returns {string} O slug da cidade (ex: "juiz-de-fora") ou uma string vazia.
 */
export function extractCidadeFromCardHtml(cardHtml, linkReal = '') {
  const cidadeFromLink = (() => {
    try {
      const pathname = new URL(linkReal).pathname;
      const match = pathname.match(/\/imovel\/[^/]+\/[^/]+\/([^/]+)\/([a-z]{2})\//i);
      return match ? `${match[1]}-${match[2].toLowerCase()}` : '';
    } catch {
      return '';
    }
  })();
  if (cidadeFromLink && cidadesList.some((cidade) => cidade.slug === cidadeFromLink)) {
    return cidadeFromLink;
  }

  if (!cardHtml || cidadesList.length === 0) {
    return '';
  }

  let nomeCidadeExtraido = '';
  try {
    // 1. Extrair o nome da cidade do HTML
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
    return ''; // Retorna vazio se houver erro no parsing do HTML
  }

  if (!nomeCidadeExtraido) {
    return '';
  }

  // Normaliza o nome da cidade extraído para a comparação.
  function normalizeText(text = '') {
    return text.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  }
  const cidadeNormalizada = normalizeText(nomeCidadeExtraido);

  // Prioriza cidades cujo nome contém 'juiz de fora' ou 'juiz-de-fora'
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

  // Se não encontrou, retorna o valor extraído em maiúsculas
  return nomeCidadeExtraido.toUpperCase();
}

// --- Exportações para Compatibilidade ---
// Mantendo os nomes antigos para evitar quebrar outras partes do seu código.
export const extractCidade = extractCidadeFromCardHtml;
export const extractCidadeFromTituloEm = extractCidadeFromCardHtml;
export const extractCidadeFromHtml = extractCidadeFromCardHtml;
