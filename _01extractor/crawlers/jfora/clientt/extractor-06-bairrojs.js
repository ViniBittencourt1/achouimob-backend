import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolverBairroCatalogo } from '../_utils/bairroCatalogo.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega a lista de bairros válidos
const bairrosPath = path.resolve(__dirname, '../../../../_03database/filtros/_jfBairros.json');
let bairrosList = [];
try {
  bairrosList = JSON.parse(fs.readFileSync(bairrosPath, 'utf8'));
} catch (e) {
  bairrosList = [];
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

function capitalizeWords(str) {
  return String(str)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/-/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function extractBairroFromCardHtml(cardHtml, cidade = '', linkReal = '') {
  const bairroExtraido = extrairBairroDoHtml(cardHtml);

  function normalizeText(text = '') {
    return String(text).toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[.,-]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  const candidatosDaCidade = bairrosList.filter((bairro) =>
    !cidade || String(bairro?.cidade || '').trim() === cidade
  );
  const principaisDaCidade = candidatosDaCidade.filter((bairro) =>
    String(bairro?.principal || 'sim').trim().toLowerCase() === 'sim'
  );
  const candidatos = [
    ...principaisDaCidade,
    ...candidatosDaCidade.filter((bairro) => String(bairro?.principal || 'sim').trim().toLowerCase() !== 'sim')
  ];
  const candidatosDoLink = [
    ...bairrosList.filter((bairro) => String(bairro?.principal || 'sim').trim().toLowerCase() === 'sim'),
    ...bairrosList.filter((bairro) => String(bairro?.principal || 'sim').trim().toLowerCase() !== 'sim')
  ];
  const buscarNoCatalogo = (valor, lista = candidatos) => {
    const normalizado = normalizeText(valor);
    if (!normalizado) return '';
    return lista.find((bairro) => normalizeText(bairro.nome) === normalizado || normalizeText(bairro.slug) === normalizado)?.slug || '';
  };

  const bairroDoLink = (() => {
    try {
      const pathname = new URL(linkReal).pathname;
      return pathname.match(/--([^-/]+)--[^-/]+--(?:mg|rj|sp|es)--(?:venda|aluguel)/i)?.[1]?.replace(/_/g, ' ') || '';
    } catch {
      return '';
    }
  })();
  // Normaliza o valor extraído para busca
  const bairroExtraidoNorm = normalizeText(bairroExtraido);

  // Extrai o conteúdo imediatamente após 'bairro' e antes da vírgula
  let valorAposBairro = '';
  const match = bairroExtraidoNorm.match(/bairro\s*([^,]*)/);
  if (match && match[1]) {
    valorAposBairro = match[1].trim();
  }

  const slugDoBairroInformado = buscarNoCatalogo(valorAposBairro || bairroExtraido);
  if (slugDoBairroInformado) return slugDoBairroInformado;

  const slugDoLink = buscarNoCatalogo(bairroDoLink);
  if (slugDoLink) return slugDoLink;

  const slugDoLinkSemRestricaoDeCidade = buscarNoCatalogo(bairroDoLink, candidatosDoLink);
  if (slugDoLinkSemRestricaoDeCidade) return slugDoLinkSemRestricaoDeCidade;

  return resolverBairroCatalogo(bairroExtraido || bairroDoLink, cidade);
}

// Export padrão para compatibilidade antiga
export const extractBairro = extractBairroFromCardHtml;
