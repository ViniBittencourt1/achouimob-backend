import { JSDOM } from 'jsdom';
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
 * Extrai a cidade do HTML, valida contra a lista e retorna o slug.
 * @param {string} cardHtml O conteúdo HTML do card.
 * @returns {string} O slug da cidade (ex: "juiz-de-fora") ou uma string vazia.
 */
export function extractCidadeFromCardHtml(cardHtml) {
  // Retorna imediatamente se não houver HTML ou se a lista de cidades não foi carregada.
  if (!cardHtml || cidadesList.length === 0) {
    return '';
  }

  let nomeCidadeExtraido = '';
  try {
    // 1. Extrai o nome da cidade do HTML (mantendo sua lógica original)
    const dom = new JSDOM(cardHtml);
    const fElement = dom.window.document.querySelector('f.ng-binding.ng-scope');
    if (fElement) {
      const texto = fElement.textContent.trim();
      const partes = texto.split(',');
      if (partes.length >= 2) {
        nomeCidadeExtraido = partes[1].split('-')[0].trim();
      }
    }
  } catch (error) {
    console.error("Erro ao processar o HTML com JSDOM:", error);
    return ''; // Retorna vazio se houver erro no parsing do HTML.
  }

  if (!nomeCidadeExtraido) {
    return ''; // Retorna vazio se a extração falhou.
  }

  // 2. Valida o nome extraído contra a lista de cidades
  const cidadeNormalizada = normalizeText(nomeCidadeExtraido);
  for (const cidade of cidadesList) {
    const nomeCidadeDaListaNormalizado = normalizeText(cidade.nome);
    if (cidade.nome && cidadeNormalizada === nomeCidadeDaListaNormalizado) {
      // 3. Retorna o SLUG se a validação for bem-sucedida
      return cidade.slug;
    }
  }

  // Se não encontrar, retorna o valor extraído em maiúsculas
  return nomeCidadeExtraido.toUpperCase();
}

// --- Exportações para Compatibilidade ---
// Padronizando os nomes para consistência.
export const extractCidade = extractCidadeFromCardHtml;
export const extractCidadeFromHtml = extractCidadeFromCardHtml;
