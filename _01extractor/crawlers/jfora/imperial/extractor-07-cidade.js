import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Bloco de Configuração para ES Modules ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Carregamento Otimizado do JSON de Cidades ---
// O arquivo é lido e processado apenas uma vez na inicialização do módulo.
const cidadesPath = path.resolve(__dirname, '../../../../_03database/filtros/_brCidades.json');
let cidadesList = [];
try {
  const cidadesData = fs.readFileSync(cidadesPath, 'utf8');
  // Armazena a lista completa de objetos (com nome e slug).
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
 * Extrai a cidade do HTML do card, valida contra a lista e retorna o slug.
 * @param {string} cardHtml O conteúdo HTML do card.
 * @param {string} [linkReal] O link real do imóvel, usado como verificação adicional ao final.
 * @returns {string} O slug da cidade (ex: "juiz-de-fora") ou uma string vazia.
 */
export function extractCidadeFromHtml(cardHtml, linkReal = '') {
  // Rotina atual (mantida): extrai a cidade a partir do HTML do card.
  const cidadeDoHtml = extractCidadeDoCardHtml(cardHtml);
  if (cidadeDoHtml) {
    return cidadeDoHtml;
  }

  // Verificação adicional ao final: o linkReal normalmente contém o slug da
  // cidade na própria URL. Pesquisa pelos slugs conhecidos e usa o
  // correspondente quando a rotina acima não encontrar nada.
  if (linkReal && linkReal.includes('juiz-de-fora')) {
    return 'juiz-de-fora-mg';
  }
  if (linkReal && linkReal.includes('rio-de-janeiro-rj')) {
    return 'rio-de-janeiro-rj';
  }
  if (linkReal && linkReal.includes('petropolis')) {
    return 'petropolis-rj';
  }
  if (linkReal && linkReal.includes('matias-barbosa')) {
    return 'matias-barbosa-mg';
  }
  if (linkReal && linkReal.includes('areal')) {
    return 'areal-rj';
  }
  if (linkReal && linkReal.includes('passa-vinte')) {
    return 'passa-vinte-mg';
  }

  return '';
}

function extractCidadeDoCardHtml(cardHtml) {
  // Retorna imediatamente se não houver HTML ou se a lista de cidades não foi carregada.
  if (!cardHtml || cidadesList.length === 0) {
    return '';
  }

  // 1. Extrai o texto completo da localização do H2.
  const localMatch = cardHtml.match(/<h2 class="imovelcard__info__local">([^<]+)<\/h2>/i);
  if (!localMatch || !localMatch[1]) {
    return '';
  }
  const textoLocalizacao = localMatch[1];

  // 2. Extrai especificamente o nome da cidade do texto da localização.
  const cidadeMatch = textoLocalizacao.match(/,\s*([^\/]+)\s*\//);
  const nomeCidadeExtraido = cidadeMatch ? cidadeMatch[1].trim() : '';
  if (!nomeCidadeExtraido) {
    return '';
  }

  // 3. Normaliza o nome da cidade extraído para uma comparação robusta.
  const cidadeNormalizada = normalizeText(nomeCidadeExtraido);

  // 4. Itera sobre a lista de cidades para encontrar uma correspondência exata.
  for (const cidade of cidadesList) {
    const nomeCidadeDaListaNormalizado = normalizeText(cidade.nome);

    // Comparação exata (===) é mais segura aqui.
    if (cidade.nome && cidadeNormalizada === nomeCidadeDaListaNormalizado) {
      // CORREÇÃO PRINCIPAL: Retorna o SLUG da cidade validada.
      return cidade.slug;
    }
  }

  // Se a cidade extraída não foi encontrada na lista, retorna o valor extraído em letras maiúsculas.
  return nomeCidadeExtraido.toUpperCase();
}
