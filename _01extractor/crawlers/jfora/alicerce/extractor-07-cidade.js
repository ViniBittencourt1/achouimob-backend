import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractLocalizacao } from './extractor-04-localizacao.js';

// --- Bloco de Configuração para ES Modules ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Carregamento Otimizado do JSON de Cidades ---
// O arquivo é lido apenas uma vez quando o módulo é iniciado.
// Usando o caminho que você confirmou ser o correto.
const cidadesPath = path.resolve(__dirname, '../../../../_03database/filtros/_brCidades.json');
let cidadesList;
function cidadesLocais() {
  if (cidadesList === undefined) {
    try {
      cidadesList = JSON.parse(fs.readFileSync(cidadesPath, 'utf8'));
      console.log('✅ Arquivo de cidades carregado com sucesso!');
    } catch (error) {
      console.error("❌ Erro ao carregar ou parsear o arquivo de cidades. Verifique o caminho:", error);
      cidadesList = [];
    }
  }
  return cidadesList;
}

/**
 * Normaliza um texto removendo acentos e convertendo para minúsculas.
 * @param {string} text O texto a ser normalizado.
 * @returns {string} O texto normalizado.
 */
function normalizeText(text = '') {
    return text.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

// Entre os itens de `lista` cujo nome (normalizado) está CONTIDO no texto (normalizado),
// retorna o de nome mais longo (mais específico). Evita que um nome curto e genérico
// (ex.: "Barbosa") vença um nome mais completo presente no mesmo texto
// (ex.: "Matias Barbosa"), o que causava cidade errada quando a busca parava no
// primeiro match por ordem do catálogo em vez do mais específico.
function encontrarMelhorCidade(textoNormalizado, lista) {
  let melhor = null;
  for (const cidade of lista) {
    const nomeNormalizado = normalizeText(cidade.nome);
    if (nomeNormalizado && textoNormalizado.includes(nomeNormalizado)) {
      if (!melhor || nomeNormalizado.length > normalizeText(melhor.nome).length) {
        melhor = cidade;
      }
    }
  }
  return melhor;
}

/**
 * Função principal que extrai a localização do HTML,
 * encontra o slug da cidade correspondente e o retorna.
 *
 * @param {string} cardHtml O conteúdo HTML a ser processado.
 * @param {string} [linkReal] O link real do imóvel, usado como sinal adicional de busca
 *   (a URL costuma conter o nome da cidade, ex.: ".../matias_barbosa--mg--venda...").
 * @returns {string} O slug da cidade (ex: "juiz-de-fora") ou uma string vazia.
 */
export function extractCidadeFromCardHtml(cardHtml, linkReal = '', cidadesInformadas) {
  const cidades = cidadesInformadas === undefined ? cidadesLocais() : cidadesInformadas;
  // Retorna imediatamente se não houver HTML ou se a lista de cidades não foi carregada.
  if (!cardHtml || cidades.length === 0) {
    return '';
  }

  // 1. Extrai o texto da localização usando a função importada.
  const textoLocalizacao = extractLocalizacao(cardHtml);
  if (!textoLocalizacao) {
    return '';
  }

  // 2. Normaliza o texto da localização *uma única vez*.
  const localizacaoNormalizada = normalizeText(textoLocalizacao);

  // Normaliza o linkReal trocando os separadores da URL (-, _, /) por espaço, para que
  // "matias_barbosa" vire "matias barbosa" e possa ser comparado como texto comum.
  const linkNormalizado = normalizeText(String(linkReal || '').replace(/[-_/]+/g, ' '));
  const textoBusca = linkNormalizado ? `${localizacaoNormalizada} ${linkNormalizado}` : localizacaoNormalizada;

  // 3. Primeiro, prioriza cidades cujo nome contém 'juiz de fora' ou 'juiz-de-fora'
  const cidadesPrioridade = cidades.filter(cidade => {
    const nomeNorm = normalizeText(cidade.nome);
    return nomeNorm.includes('juiz de fora') || nomeNorm.includes('juiz-de-fora');
  });

  // Busca exata entre nome da cidade e localização normalizada (prioridade)
  for (const cidade of cidadesPrioridade) {
    const nomeCidadeNormalizado = normalizeText(cidade.nome);
    if (localizacaoNormalizada === nomeCidadeNormalizado) {
      return cidade.slug;
    }
  }

  // Busca exata entre nome da cidade e localização normalizada (todas cidades)
  for (const cidade of cidades) {
    const nomeCidadeNormalizado = normalizeText(cidade.nome);
    if (localizacaoNormalizada === nomeCidadeNormalizado) {
      return cidade.slug;
    }
  }

  // Busca por "includes" (localização + linkReal), priorizando o nome de cidade mais
  // específico (mais longo) entre todos os que aparecem no texto de busca.
  const melhorPrioridade = encontrarMelhorCidade(textoBusca, cidadesPrioridade);
  if (melhorPrioridade) {
    return melhorPrioridade.slug;
  }

  const melhorGeral = encontrarMelhorCidade(textoBusca, cidades);
  if (melhorGeral) {
    return melhorGeral.slug;
  }

  // Se não encontrou, retorna o valor inicial extraído em maiúsculas
  return textoLocalizacao.toUpperCase();
}

// --- Exportações para Compatibilidade ---
// Mantendo os nomes antigos para garantir que outras partes do código não quebrem.
export const extractCidade = extractCidadeFromCardHtml;
export const extractCidadeFromTituloEm = extractCidadeFromCardHtml;
