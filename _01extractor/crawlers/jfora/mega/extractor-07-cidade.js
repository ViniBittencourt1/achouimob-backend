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
  const fallbackCidade = 'juiz-de-fora-mg';

  if (!cardHtml) {
    return fallbackCidade;
  }

  const linkTexto = String(cardHtml || '');
  const hrefMatch = linkTexto.match(/href=["']([^"']+)["']/i);
  const linkReal = hrefMatch?.[1] || linkTexto;

  // Para o Mega, a cidade confiável fica no final da URL do imóvel.
  // Ex.: .../te000312-terreno-venda-alphaville-juiz-de-fora-mg/
  const juizDeForaNoFimDoLink = /-juiz-de-fora-mg\/?(?:[?#].*)?$/i.test(linkReal);
  if (juizDeForaNoFimDoLink) {
    const cidadeJuizDeFora = cidadesList.find((cidade) => normalizeText(cidade.slug) === 'juiz-de-fora-mg');
    if (cidadeJuizDeFora?.slug) {
      return cidadeJuizDeFora.slug;
    }
  }

  const linkMatch = linkTexto.match(/https?:\/\/[^\s"']+\/imovel\/[^\s"']*?([a-z0-9-]+-[a-z]{2})(?:\/)?(?=["'\s]|$)/i)
    || linkTexto.match(/\/imovel\/[^\s"']*?([a-z0-9-]+-[a-z]{2})(?:\/)?(?=["'\s]|$)/i);

  if (linkMatch?.[1]) {
    const cidadeSlug = linkMatch[1].toLowerCase();
    const cidadeExiste = cidadesList.some((cidade) => normalizeText(cidade.slug) === normalizeText(cidadeSlug));
    if (cidadeExiste) {
      return cidadeSlug;
    }
  }

  const cidadeNoLink = cidadesList.find((cidade) => {
    const slug = String(cidade.slug || '').toLowerCase();
    return linkTexto.toLowerCase().includes(`-${slug}/`) || linkTexto.toLowerCase().includes(`-${slug}-`) || linkTexto.toLowerCase().includes(`/${slug}`) || linkTexto.toLowerCase().includes(`${slug}/`);
  });

  if (cidadeNoLink?.slug) {
    return cidadeNoLink.slug;
  }

  let nomeCidadeExtraido = '';
  try {
    const dom = new JSDOM(cardHtml);
    const titulo = dom.window.document.querySelector('.wpgb-block-11, h3 a, h2 a, h4 a, h1')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    if (/juiz\s+de\s+fora/i.test(titulo)) {
      nomeCidadeExtraido = 'Juiz de Fora';
    }

    if (!nomeCidadeExtraido) {
      const link = dom.window.document.querySelector('a.wpgb-card-layer-link[href*="/imovel/"], a[href*="/imovel/"]')?.getAttribute('href') || '';
      if (/juiz-de-fora-mg/i.test(link)) {
        nomeCidadeExtraido = 'Juiz de Fora';
      }
    }
  } catch {
    return fallbackCidade;
  }

  if (!nomeCidadeExtraido) {
    return fallbackCidade;
  }

  const cidadeNormalizada = normalizeText(nomeCidadeExtraido);
  const cidadesPrioridade = cidadesList.filter((cidade) => {
    const nomeNorm = normalizeText(cidade.nome);
    return nomeNorm.includes('juiz de fora') || nomeNorm.includes('juiz-de-fora');
  });

  for (const cidade of cidadesPrioridade) {
    const nomeCidadeDaListaNormalizado = normalizeText(cidade.nome);
    if (cidadeNormalizada === nomeCidadeDaListaNormalizado) {
      return cidade.slug;
    }
  }

  for (const cidade of cidadesList) {
    const nomeCidadeDaListaNormalizado = normalizeText(cidade.nome);
    if (cidadeNormalizada === nomeCidadeDaListaNormalizado) {
      return cidade.slug;
    }
  }

  return fallbackCidade;
}

// --- Exportações para Compatibilidade ---
export const extractCidade = extractCidadeFromCardHtml;
export const extractCidadeFromTituloEm = extractCidadeFromCardHtml;
