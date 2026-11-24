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
  // O catch já lida com o erro de arquivo não encontrado, então fs.existsSync é redundante.
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
 * Função principal que extrai a cidade de um cabeçalho H2,
 * valida contra a lista de cidades e retorna o slug correspondente.
 *
 * @param {string} cardHtml O conteúdo HTML a ser processado.
 * @returns {string} O slug da cidade (ex: "juiz-de-fora") ou uma string vazia.
 */
export function extractCidadeFromCardHtml(cardHtml) {
  // Retorna 'juiz-de-fora-mg' se não houver HTML ou se a lista de cidades não foi carregada.
  if (!cardHtml || cidadesList.length === 0) {
    return 'juiz-de-fora-mg';
  }

  // 1. Extrai o texto do cabeçalho H2 usando RegExp.
  const regex = /<h2 class="card-with-buttons__heading">([^<]*)/i;
  const match = cardHtml.match(regex);
  if (!match || !match[1]) {
    return 'juiz-de-fora-mg';
  }

  // 2. Extrai a parte que corresponde à cidade.
  const partes = match[1].split(' -').map(s => s.trim());
  const nomeCidadeExtraido = partes.length >= 2 ? partes[1] : '';
  if (!nomeCidadeExtraido) {
    return 'juiz-de-fora-mg';
  }

  // 3. Normaliza o nome da cidade extraído *uma única vez*.
  const cidadeNormalizada = normalizeText(nomeCidadeExtraido);

  // 4. Itera sobre a lista de cidades para encontrar uma correspondência exata.
  for (const cidade of cidadesList) {
    const nomeCidadeDaListaNormalizado = normalizeText(cidade.nome);

    // Comparação exata (===) para maior precisão.
    if (cidade.nome && cidadeNormalizada === nomeCidadeDaListaNormalizado) {
      // CORREÇÃO PRINCIPAL: Retorna o SLUG da cidade validada.
      return cidade.slug;
    }
  }

  // Se a cidade extraída não foi encontrada na lista, retorna o valor extraído em letras maiúsculas.
  return nomeCidadeExtraido.toUpperCase();
}

// --- Exportações para Compatibilidade ---
export const extractCidade = extractCidadeFromCardHtml;
export const extractCidadeFromTituloEm = extractCidadeFromCardHtml;
