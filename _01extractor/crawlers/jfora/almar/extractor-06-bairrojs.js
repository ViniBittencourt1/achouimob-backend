import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolverBairroCatalogo } from '../_utils/bairroCatalogo.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega o catalogo de bairros (mesmo arquivo usado pelo painel: slug, cidade, nome, principal).
const bairrosPath = path.resolve(__dirname, '../../../../_03database/filtros/_jfBairros.json');
let bairrosList;
function bairrosLocais() {
  if (bairrosList === undefined) {
    try {
      bairrosList = JSON.parse(fs.readFileSync(bairrosPath, 'utf8'));
    } catch (e) {
      bairrosList = [];
    }
  }
  return bairrosList;
}

function normalizeText(text = '') {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Função para extrair o bairro do HTML do card a partir da div de localização
function extrairBairroDoHtml(html) {
  // Regex para pegar o conteúdo da div de localização
  const regex = /<div class="imovel-item--localizacao[^"]*">\s*([^,<]*)/i;
  const match = html.match(regex);
  if (match && match[1]) {
    return match[1].trim();
  }
  return '';
}

// Quando o texto extraído contém a palavra "bairro" (ex.: "...NO BAIRRO CENTRO"),
// isola o trecho que vem depois dela, que costuma ser o nome do bairro em si,
// mais preciso para a checagem no catálogo do que o texto completo.
function extrairValorAposPalavraBairro(texto) {
  const match = String(texto).match(/\bbairro\b\s*[:\-]?\s*(.+)$/i);
  return match && match[1] ? match[1].trim() : '';
}

// Procura, entre os candidatos do catálogo, o item cujo nome (normalizado) está
// contido no texto (normalizado). Em caso de múltiplos matches, prioriza o nome
// mais longo (mais específico), evitando que um nome curto (ex.: "centro")
// vença um nome mais completo presente no mesmo texto (ex.: "centro sul").
function buscarBairroExato(texto, candidatos) {
  const valorNormalizado = normalizeText(texto);
  return candidatos.find((item) => {
    const nomeNormalizado = normalizeText(item.nome);
    const slugNormalizado = normalizeText(item.slug);
    return valorNormalizado === nomeNormalizado || valorNormalizado === slugNormalizado;
  }) || null;
}

function extrairBairroDoLink(linkReal, cidade, bairrosInformados) {
  const cidadeNoLink = normalizeText(cidade).replace(/\s+mg$/, '').replace(/\s+/g, '_');
  if (!linkReal || !cidadeNoLink) return '';

  const localizacaoNoLink = String(linkReal).match(new RegExp(`--(.+?)--${cidadeNoLink}--[a-z]{2}--`, 'i'))?.[1];
  return localizacaoNoLink ? resolverBairroCatalogo(localizacaoNoLink, cidade, bairrosInformados) : '';
}

/**
 * Extrai o bairro de um card e tenta casar o valor bruto extraído (ex.:
 * "COND. EDIFÍCIO GARAGEM HERCULES NO BAIRRO CENTRO") com algum item do
 * catálogo de bairros cujo nome esteja CONTIDO no texto extraído (ex.: "CENTRO"),
 * retornando o slug correspondente. Quando a cidade é conhecida, a busca é
 * restrita aos bairros daquela cidade (evita colisão entre cidades diferentes
 * que possuem bairro com o mesmo nome, ex.: "centro"). Se nenhum item do
 * catálogo for encontrado no texto, retorna o valor bruto em maiúsculas.
 *
 * @param {string} cardHtml HTML do card do imóvel.
 * @param {string} [cidade] Slug da cidade já identificada para este card.
 * @param {string} [linkReal] Link do imóvel, usado como fallback de localização.
 */
export function extractBairroFromCardHtml(cardHtml, cidade = '', linkReal = '', bairrosInformados) {
  if (!cardHtml && !linkReal) return '';

  const bairroExtraido = extrairBairroDoHtml(cardHtml || '');
  if (!bairroExtraido) return extrairBairroDoLink(linkReal, cidade, bairrosInformados);
  if (bairroExtraido === '.') return 'nao-informado';

  const cidadeNormalizada = normalizeText(cidade);
  const bairros = bairrosInformados === undefined ? bairrosLocais() : bairrosInformados;
  const candidatos = cidadeNormalizada
    ? bairros.filter((item) => normalizeText(item.cidade) === cidadeNormalizada)
    : bairros;

  // 1 - Se o texto contém a palavra "bairro", prioriza o trecho após ela
  // (ex.: "...NO BAIRRO CENTRO" -> "CENTRO"), mais preciso para o catálogo.
  const valorAposBairro = extrairValorAposPalavraBairro(bairroExtraido);
  if (valorAposBairro) {
    const match = buscarBairroExato(valorAposBairro, candidatos);
    if (match) {
      return match.slug || match.nome;
    }
  }

  // 2 - Caso não ache pelo trecho após "bairro", tenta o valor completo.
  const matchTextoCompleto = buscarBairroExato(bairroExtraido, candidatos);
  if (matchTextoCompleto) {
    return matchTextoCompleto.slug || matchTextoCompleto.nome;
  }

  return extrairBairroDoLink(linkReal, cidade, bairrosInformados);
}

// Export padrão para compatibilidade antiga
export const extractBairro = extractBairroFromCardHtml;
