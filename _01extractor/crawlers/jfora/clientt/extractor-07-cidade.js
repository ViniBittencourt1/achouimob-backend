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

  // 2. Tenta extrair o valor entre duas vírgulas
  let valorEntreVirgulas = '';
  const match = textoLocalizacao.match(/,\s*([^,]+)\s*,/);
  if (match && match[1]) {
    valorEntreVirgulas = match[1].trim();
  }

  // 3. Se encontrou valor entre vírgulas, pesquisa no JSON
  if (valorEntreVirgulas) {
    const valorNormalizado = normalizeText(valorEntreVirgulas);
    for (const cidade of cidadesList) {
      const nomeCidadeNormalizado = normalizeText(cidade.nome);
      if (valorNormalizado === nomeCidadeNormalizado || valorNormalizado.includes(nomeCidadeNormalizado) || nomeCidadeNormalizado.includes(valorNormalizado)) {
        return cidade.slug;
      }
    }
  }

  // 4. Se não encontrou, volta ao início e pesquisa o texto completo (lógica antiga)
  const localizacaoNormalizada = normalizeText(textoLocalizacao);
  for (const cidade of cidadesList) {
    const nomeCidadeNormalizado = normalizeText(cidade.nome);
    if (cidade.nome && localizacaoNormalizada.includes(nomeCidadeNormalizado)) {
      return cidade.slug;
    }
  }

  // 5. Se não encontrar, retorna o primeiro valor pesquisado (valorEntreVirgulas ou textoLocalizacao) em maiúsculas
  if (valorEntreVirgulas) {
    return valorEntreVirgulas.toUpperCase();
  }
  return textoLocalizacao.toUpperCase();
}

// --- Exportações para Compatibilidade ---
// Mantendo os nomes antigos para garantir que outras partes do código não quebrem.
export const extractCidade = extractCidadeFromCardHtml;
export const extractCidadeFromTituloEm = extractCidadeFromCardHtml;
