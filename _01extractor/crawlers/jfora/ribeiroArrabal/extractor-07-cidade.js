import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractLocalizacao } from './extractor-04-localizacao.js';

// --- Bloco de Configuração para ES Modules ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Carregamento Otimizado do JSON de Cidades ---
// O arquivo é lido e processado apenas uma vez na inicialização do módulo.
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

/**
 * Função principal que extrai a localização do HTML,
 * encontra o slug da cidade correspondente e o retorna.
 *
 * @param {string} cardHtml O conteúdo HTML a ser processado.
 * @returns {string} O slug da cidade (ex: "juiz-de-fora") ou uma string vazia.
 */
export function extractCidadeFromCardHtml(cardHtml) {
  // Retorna imediatamente se não houver HTML ou se a lista de cidades não foi carregada.
  if (!cardHtml || cidadesList.length === 0) {
    return '';
  }

  // 1. Extrai o texto da localização usando a função importada.
  const textoLocalizacao = extractLocalizacao(cardHtml);
  if (!textoLocalizacao) {
    return '';
  }

  // Prioriza busca por "juiz de fora"
  if (normalizeText(textoLocalizacao).includes('juiz de fora')) {
    return 'juiz-de-fora-mg';
  }

  // 2. Normaliza o texto da localização *uma única vez* para otimização.
  const localizacaoNormalizada = normalizeText(textoLocalizacao);

  // 3. Itera sobre a lista de cidades para encontrar uma correspondência.
  for (const cidade of cidadesList) {
    const nomeCidadeNormalizado = normalizeText(cidade.nome);
    if (cidade.nome && localizacaoNormalizada.includes(nomeCidadeNormalizado)) {
      return cidade.slug;
    }
  }

  // Se não encontrar, retorna o valor extraído em maiúsculas
  return textoLocalizacao.toUpperCase();
}

// --- Exportações para Compatibilidade ---
// Mantendo os nomes antigos para garantir que outras partes do código não quebrem.
export const extractCidade = extractCidadeFromCardHtml;
export const extractCidadeFromTituloEm = extractCidadeFromCardHtml;
