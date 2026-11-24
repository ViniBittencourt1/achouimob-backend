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
  const fallbackCidade = 'juiz-de-fora-mg';

  if (!cardHtml) {
    return fallbackCidade;
  }

  const linkTexto = String(cardHtml || '');

  const hrefMatch = linkTexto.match(/href=["']([^"']+)["']/i);
  const linkEmTexto = hrefMatch?.[1] || linkTexto;

  // Prioriza o padrão da URL do Locato: ...--cidade--mg--venda...
  // Exemplo real: /imovel/lote__terreno--loteamento_villa_real--matias_barbosa--mg--venda--cod-4835
  const matchesCidadeUrl = Array.from(linkEmTexto.matchAll(/(?:^|\/imovel\/|[\/_-])([a-z0-9_]+)--([a-z]{2})--venda\b/gi));
  const ultimaCidadeUrl = matchesCidadeUrl.at(-1);

  if (ultimaCidadeUrl?.[1] && ultimaCidadeUrl?.[2]) {
    const cidadeNormalizada = ultimaCidadeUrl[1].replace(/_/g, '-').toLowerCase();
    const ufNormalizada = ultimaCidadeUrl[2].toLowerCase();
    const cidadeSlug = `${cidadeNormalizada}-${ufNormalizada}`;
    const cidadeExiste = cidadesList.some((cidade) => normalizeText(cidade.slug) === normalizeText(cidadeSlug));
    if (cidadeExiste) {
      return cidadeSlug;
    }

    const cidadeCatalogo = cidadesList.find((cidade) =>
      normalizeText(cidade.slug).includes(normalizeText(cidadeNormalizada)) ||
      normalizeText(cidade.nome).includes(normalizeText(cidadeNormalizada.replace(/-/g, ' ')))
    );
    if (cidadeCatalogo?.slug) {
      return cidadeCatalogo.slug;
    }
  }

  const linkCidadeByCatalog = cidadesList.find((cidade) => {
    const slug = String(cidade.slug || '').trim();
    return new RegExp(`--${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}--`, 'i').test(linkTexto);
  });

  if (linkCidadeByCatalog?.slug) {
    return linkCidadeByCatalog.slug;
  }

  if (cidadesList.length === 0) {
    return fallbackCidade;
  }

  const textoLocalizacao = extractLocalizacao(cardHtml) || '';
  if (!textoLocalizacao) {
    return fallbackCidade;
  }

  const cidadeExata = cidadesList.find((cidade) => normalizeText(cidade.nome) === 'juiz de fora');
  if (cidadeExata && normalizeText(textoLocalizacao).includes('juiz de fora')) {
    return cidadeExata.slug;
  }

  return fallbackCidade;
}

// --- Exportações para Compatibilidade ---
// Mantendo os nomes antigos para garantir que outras partes do código não quebrem.
export const extractCidade = extractCidadeFromCardHtml;
export const extractCidadeFromTituloEm = extractCidadeFromCardHtml;
