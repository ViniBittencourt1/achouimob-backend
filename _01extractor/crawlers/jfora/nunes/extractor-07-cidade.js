import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Bloco de ConfiguraÃ§Ã£o para ES Modules ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Carregamento Otimizado do JSON de Cidades ---
// O arquivo Ã© lido e processado apenas uma vez na inicializaÃ§Ã£o do mÃ³dulo.
const cidadesPath = path.resolve(__dirname, '../../../../_03database/filtros/_brCidades.json');
let cidadesList = [];
try {
  const cidadesData = fs.readFileSync(cidadesPath, 'utf8');
  // Armazena a lista completa de objetos (com nome e slug).
  cidadesList = JSON.parse(cidadesData);
  console.log('âœ… Arquivo de cidades carregado com sucesso!');
} catch (error) {
  // O catch jÃ¡ lida com o erro de arquivo nÃ£o encontrado, entÃ£o fs.existsSync Ã© redundante.
  console.error("âŒ Erro ao carregar ou parsear o arquivo de cidades. Verifique o caminho:", error);
}

/**
 * Normaliza um texto removendo acentos e convertendo para minÃºsculas.
 * @param {string} text O texto a ser normalizado.
 * @returns {string} O texto normalizado.
 */
function normalizeText(text = '') {
    return text.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function normalizeSlug(text = '') {
  return normalizeText(text).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function extractCidadeFromLinkReal(linkReal) {
  let segmentos;
  try {
    segmentos = decodeURIComponent(new URL(linkReal).pathname).split('/').filter(Boolean).map(normalizeSlug);
  } catch {
    return '';
  }

  const juizDeFora = cidadesList.find(cidade => normalizeSlug(cidade.slug) === 'juiz-de-fora-mg');
  if (juizDeFora && segmentos.some(segmento => /(?:^|-)juiz-de-fora(?:-|$)/.test(segmento))) {
    return juizDeFora.slug;
  }

  let correspondencia;
  for (const cidade of cidadesList) {
    const slug = normalizeSlug(cidade.slug);
    const slugSemUf = slug.replace(/-[a-z]{2}$/, '');
    if (!slug || !slugSemUf) continue;
    const aliases = slug === slugSemUf ? [slug] : [slug, slugSemUf];
    const encontrada = segmentos.some(segmento => aliases.some(alias =>
      segmento === alias || segmento.startsWith(`${alias}-`) || segmento.endsWith(`-${alias}`) || segmento.includes(`-${alias}-`)
    ));
    if (encontrada && (!correspondencia || slugSemUf.length > normalizeSlug(correspondencia.slug).replace(/-[a-z]{2}$/, '').length)) {
      correspondencia = cidade;
    }
  }
  return correspondencia?.slug || '';
}

/**
 * FunÃ§Ã£o principal que extrai a cidade do titulo do card,
 * valida contra la lista de cidades e retorna o slug correspondente.
 *
 * @param {string} cardHtml O conteÃºdo HTML a ser processado.
 * @returns {string} O slug da cidade (ex: "juiz-de-fora") ou uma string vazia.
 */
export function extractCidadeFromCardHtml(cardHtml, linkReal = '') {
  if (cidadesList.length === 0) {
    return '';
  }

  const cidadeDoLink = extractCidadeFromLinkReal(linkReal);
  if (cidadeDoLink === cidadesList.find(cidade => normalizeSlug(cidade.slug) === 'juiz-de-fora-mg')?.slug) {
    return cidadeDoLink;
  }

  // 1. Extrai o texto do heading do card usando RegExp.
  const regex = /<h2 class="card-with-buttons__heading">([^<]*)<\/h2>/i;
  const match = String(cardHtml || '').match(regex);
  const partes = match?.[1]?.trim().split('-').map((s) => s.trim()).filter(Boolean) || [];
  const nomeCidadeExtraido = partes.length >= 2 ? partes[1] : '';

  if (nomeCidadeExtraido) {
    const cidadeNormalizada = normalizeText(nomeCidadeExtraido);
    for (const cidade of cidadesList) {
      if (cidade.nome && cidadeNormalizada === normalizeText(cidade.nome)) {
        return cidade.slug;
      }
    }
  }

  if (cidadeDoLink) return cidadeDoLink;

  return nomeCidadeExtraido ? nomeCidadeExtraido.toUpperCase() : '';
}

// --- ExportaÃ§Ãµes para Compatibilidade ---
export const extractCidade = extractCidadeFromCardHtml;
export const extractCidadeFromTituloEm = extractCidadeFromCardHtml;
