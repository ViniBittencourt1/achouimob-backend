import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractLocalizacao } from './extractor-04-localizacao.js';

// --- Bloco de Configuração para ES Modules ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Carregamento Otimizado do JSON de Cidades ---
// O arquivo é lido apenas uma vez quando o módulo é iniciado.
const cidadesPath = path.resolve(__dirname, '../../../../_03database/filtros/_brCidades.json');
let cidadesList = [];
try {
  const cidadesData = fs.readFileSync(cidadesPath, 'utf8');
  cidadesList = JSON.parse(cidadesData);
  console.log('✅ Arquivo de cidades carregado com sucesso!');
} catch (error) {
  // Log detalhado em caso de falha no carregamento ou parsing.
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

function normalizeSlug(text = '') {
    return normalizeText(text)
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function extractCidadeFromLink(linkReal = '') {
  if (!linkReal) return null;

  let pathname = String(linkReal);
  try {
    pathname = new URL(pathname).pathname;
  } catch (error) {
    pathname = pathname.split(/[?#]/, 1)[0];
  }

  const segmentos = decodeURIComponent(pathname).toLowerCase().split('--');
  for (let index = 1; index < segmentos.length; index++) {
    const cidadeSegmento = normalizeSlug(segmentos[index - 1]);
    const estadoSegmento = normalizeText(segmentos[index]).trim();
    if (!cidadeSegmento || !/^[a-z]{2}$/.test(estadoSegmento)) continue;

    const cidade = cidadesList.find(item => {
      const slugCidade = normalizeSlug(String(item.slug || '').replace(/-[^-]+$/, ''));
      return slugCidade === cidadeSegmento && normalizeText(item.estado).trim() === estadoSegmento;
    });
    if (cidade?.slug) return cidade.slug;
  }

  return null;
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
export function extractCidadeFromCardHtml(cardHtml, linkReal = '') {
  // Retorna imediatamente se não houver HTML ou se a lista de cidades não foi carregada.
  if (cidadesList.length === 0) {
    return '';
  }

  const cidadeDoLink = extractCidadeFromLink(linkReal);
  if (cidadeDoLink) return cidadeDoLink;

  if (!cardHtml) return '';

  // 1. Extrai o texto da localização usando a função importada.
  const textoLocalizacao = extractLocalizacao(cardHtml);
  if (!textoLocalizacao) {
    return '';
  }

  // 2. Normaliza o texto da localização *uma única vez* para otimização.
  const localizacaoNormalizada = normalizeText(textoLocalizacao);

  // Normaliza o linkReal trocando os separadores da URL (-, _, /) por espaço, para que
  // "matias_barbosa" vire "matias barbosa" e possa ser comparado como texto comum.
  const linkNormalizado = normalizeText(String(linkReal || '').replace(/[-_/]+/g, ' '));
  const textoBusca = linkNormalizado ? `${localizacaoNormalizada} ${linkNormalizado}` : localizacaoNormalizada;

  // PRIORIDADE: Se localizar 'juiz de fora' normalizado, retorna o slug de Juiz de Fora
  if (textoBusca.includes('juiz de fora') || textoBusca.includes('juiz-de-fora')) {
    const cidadeJf = cidadesList.find(c => normalizeText(c.nome) === 'juiz de fora' || normalizeText(c.nome) === 'juiz-de-fora');
    if (cidadeJf && cidadeJf.slug) {
      return cidadeJf.slug;
    }
  }

  // 3. Busca por "includes" (localização + linkReal), priorizando o nome de cidade mais
  // específico (mais longo) entre todos os que aparecem no texto de busca, em vez do
  // primeiro por ordem do catálogo.
  const melhor = encontrarMelhorCidade(textoBusca, cidadesList);
  if (melhor) {
    return melhor.slug;
  }

  // Se nenhuma cidade da lista for encontrada, retorna o valor extraído em letras maiúsculas.
  return textoLocalizacao.toUpperCase();
}

// --- Exportações para Compatibilidade ---
// Mantendo os nomes antigos para garantir que outras partes do código não quebrem.
export const extractCidade = extractCidadeFromCardHtml;
export const extractCidadeFromTituloEm = extractCidadeFromCardHtml;
