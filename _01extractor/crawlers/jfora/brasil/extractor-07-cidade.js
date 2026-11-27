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
let cidadesList;
function cidadesLocais() {
  if (cidadesList === undefined) {
    try {
      cidadesList = JSON.parse(fs.readFileSync(cidadesPath, 'utf8'));
      console.log('✅ Arquivo de cidades carregado com sucesso!');
    } catch (error) {
      cidadesList = [];
      console.error("❌ Erro ao carregar ou parsear o arquivo de cidades. Verifique o caminho:", error);
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

/**
 * Função principal que extrai a localização do HTML,
 * encontra o slug da cidade correspondente e o retorna.
 *
 * @param {string} cardHtml O conteúdo HTML a ser processado.
 * @returns {string} O slug da cidade (ex: "juiz-de-fora") ou uma string vazia.
 */
export function extractCidadeFromCardHtml(cardHtml, cidadesInformadas) {
  const cidadesList = cidadesInformadas === undefined ? cidadesLocais() : cidadesInformadas;
  // Retorna imediatamente se não houver HTML ou se a lista de cidades não foi carregada.
  if (!cardHtml || cidadesList.length === 0) {
    return '';
  }

  // 1. Extrai o texto da localização usando a função importada.
  const textoLocalizacao = extractLocalizacao(cardHtml);
  if (!textoLocalizacao) {
    return '';
  }

  // 2. Normaliza o texto da localização *uma única vez* para otimização.
  const localizacaoNormalizada = normalizeText(textoLocalizacao);

  // PRIORIDADE: Se localizar 'juiz de fora' normalizado, retorna o slug de Juiz de Fora
  if (localizacaoNormalizada.includes('juiz de fora') || localizacaoNormalizada.includes('juiz-de-fora')) {
    const cidadeJf = cidadesList.find(c => normalizeText(c.nome) === 'juiz de fora' || normalizeText(c.nome) === 'juiz-de-fora');
    if (cidadeJf && cidadeJf.slug) {
      return cidadeJf.slug;
    }
  }

  // 3. Itera sobre a lista de cidades para encontrar uma correspondência.
  for (const cidade of cidadesList) {
    // A busca por 'includes' é apropriada aqui, pois o texto de localização
    // pode conter mais informações (ex: "Apartamento em Centro, Juiz de Fora - MG").
    const nomeCidadeNormalizado = normalizeText(cidade.nome);

    if (cidade.nome && localizacaoNormalizada.includes(nomeCidadeNormalizado)) {
      // CORREÇÃO PRINCIPAL: Retorna o SLUG da cidade, não o nome.
      return cidade.slug;
    }
  }

  // Se nenhuma cidade da lista for encontrada, retorna o valor extraído em letras maiúsculas.
  return textoLocalizacao.toUpperCase();
}

// --- Exportações para Compatibilidade ---
// Mantendo os nomes antigos para garantir que outras partes do código não quebrem.
export const extractCidade = extractCidadeFromCardHtml;
export const extractCidadeFromTituloEm = extractCidadeFromCardHtml;
