import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Obter o caminho do diretório atual em ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega a lista de cidades válidas (ajustado para _brCidades.json)
const cidadesPath = path.resolve(__dirname, '../../../../_03database/filtros/_brCidades.json');
let cidadesList = [];
try {
  const cidadesData = fs.readFileSync(cidadesPath, 'utf8');
  cidadesList = JSON.parse(cidadesData);
  console.log('✅ Arquivo de cidades carregado com sucesso!');
} catch (error) {
  console.error('❌ Erro ao carregar ou parsear o arquivo de cidades. Verifique o caminho:', error);
  cidadesList = [];
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
 * Extrai o nome da cidade a partir de uma string de localização completa
 * e valida com a lista de cidades, retornando o slug correspondente.
 * Prioriza a busca por cidades da lista dentro da string de localização.
 *
 * @param {string} localizacaoCompleta - A string completa de localização, e.g., "Bairro, Cidade, Estado" ou "Cidade - Bairro".
 * @returns {string} O slug da cidade encontrado ou uma string vazia se não for encontrado.
 */
export function extractCidade(localizacaoCompleta) {
  if (!localizacaoCompleta || typeof localizacaoCompleta !== 'string' || cidadesList.length === 0) {
    return '';
  }

  // NOVA LÓGICA: normaliza o valor extraído e busca coincidência inteira no JSON
  const localizacaoNormalizada = normalizeText(localizacaoCompleta);
  for (const cidade of cidadesList) {
    const nomeNorm = normalizeText(cidade.nome);
    // Coincidência inteira
    if (localizacaoNormalizada === nomeNorm) {
      return cidade.slug || '';
    }
  }

  // 1. Prioriza JUIZ DE FORA
  const cidadesPrioridade = cidadesList.filter(cidade => {
    const nomeNorm = normalizeText(cidade.nome);
    return nomeNorm.includes('juiz de fora') || nomeNorm.includes('juiz-de-fora');
  });

  // Busca exata (palavra inteira) para JUIZ DE FORA
  for (const cidade of cidadesPrioridade) {
    const nomeCidadeNormalizado = normalizeText(cidade.nome);
    // Verifica se a string contém a palavra inteira (usando regex de palavra)
    const regex = new RegExp(`\\b${nomeCidadeNormalizado}\\b`, 'i');
    if (regex.test(localizacaoNormalizada)) {
      return cidade.slug || '';
    }
  }

  // Busca exata (palavra inteira) para todas cidades
  for (const cidade of cidadesList) {
    const nomeCidadeNormalizado = normalizeText(cidade.nome);
    const regex = new RegExp(`\\b${nomeCidadeNormalizado}\\b`, 'i');
    if (regex.test(localizacaoNormalizada)) {
      return cidade.slug || '';
    }
  }

  // Busca por includes (prioridade JUIZ DE FORA)
  for (const cidade of cidadesPrioridade) {
    const nomeCidadeNormalizado = normalizeText(cidade.nome);
    if (localizacaoNormalizada.includes(nomeCidadeNormalizado)) {
      return cidade.slug || '';
    }
  }

  // Busca por includes (todas cidades)
  for (const cidade of cidadesList) {
    const nomeCidadeNormalizado = normalizeText(cidade.nome);
    if (localizacaoNormalizada.includes(nomeCidadeNormalizado)) {
      return cidade.slug || '';
    }
  }

  // Fallback: tenta extrair a segunda parte após vírgula ou hífen e buscar palavra inteira
  const partes = localizacaoCompleta.split(/[,-]/).map(p => p.trim());
  if (partes.length > 1) {
    const possivelCidadeExtraida = normalizeText(partes[1]);
    for (const cidade of cidadesList) {
      const nomeCidadeNormalizado = normalizeText(cidade.nome);
      const regex = new RegExp(`\\b${nomeCidadeNormalizado}\\b`, 'i');
      if (regex.test(possivelCidadeExtraida)) {
        return cidade.slug || '';
      }
    }
  }

  // Se não encontrar correspondência, retorna o valor inicial procurado em letras maiúsculas
  return localizacaoCompleta.toUpperCase();
}