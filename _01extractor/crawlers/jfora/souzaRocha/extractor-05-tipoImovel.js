import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function normalizarTipoDoLink(value) {
  return String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function extractTipoImovelDoLink(linkReal) {
  if (!linkReal) return '';
  let segmento;
  try {
    const url = new URL(linkReal, 'https://souzarochaimoveis.com.br');
    segmento = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '');
  } catch (error) {
    if (!(error instanceof TypeError || error instanceof URIError)) throw error;
    console.warn('[extractTipoImovelDoLink] Link invalido:', linkReal, error.message);
    return '';
  }
  const palavras = normalizarTipoDoLink(segmento).split(' ');
  const filtroPath = path.resolve(__dirname, '../../../../_03database/filtros/_brTipoImovel.json');
  const catalogo = JSON.parse(fs.readFileSync(filtroPath, 'utf8'));
  const tipos = Object.values(catalogo.tiposPorSlug).flat();
  // O primeiro tipo no endereco precede caracteristicas como suite e garagem.
  for (let index = 0; index < palavras.length; index++) {
    const matches = [];
    for (const tipo of tipos) {
      for (const valor of [tipo.nome, tipo.slug]) {
        const nome = normalizarTipoDoLink(valor);
        if (!nome) continue;
        const tamanho = nome.split(' ').length;
        if (palavras.slice(index, index + tamanho).join(' ') === nome) {
          matches.push({ slug: tipo.slug, tamanho });
        }
      }
    }
    if (!matches.length) continue;
    const maior = Math.max(...matches.map(item => item.tamanho));
    const slugs = new Set(matches.filter(item => item.tamanho === maior).map(item => item.slug));
    return slugs.size === 1 ? slugs.values().next().value : '';
  }
  return '';
}

// Extrai o tipo do imóvel do primeiro <span style="color: #000000;"> dentro de <div class="rh_content"> e retorna o valor integral extraído
export function extractTipoImovel(cardHtml) {
  if (!cardHtml || typeof cardHtml !== 'string') return '';
  // Extrai o conteúdo do primeiro <span style="color: #000000;"> dentro de <div class="rh_content">
  const match = cardHtml.match(/<div[^>]*class\s*=\s*(['"])rh_content\1[^>]*>[\s\S]*?<span[^>]*style\s*=\s*(['"])color:\s*#000000;\2[^>]*>([\s\S]*?)<\/span>/i);
  let tipoExtraido = '';
  if (match) {
    tipoExtraido = match[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  }
  if (!tipoExtraido) return '';
  // Retorna apenas a primeira palavra, ou a próxima se for numérica
  const palavras = tipoExtraido.split(' ').filter(Boolean);
  let valor = palavras[0] || '';
  // Se for numérico, pega a próxima palavra
  if (!isNaN(Number(valor)) && palavras.length > 1) {
    valor = palavras[1];
  }
  // Se for 'Excelente', pega a próxima palavra
  if (valor.toLowerCase() === 'excelente' && palavras.length > 1) {
    valor = palavras[1];
  }
  // Retorna o slug pesquisado no JSON
  return buscarSlugTipoImovel(valor);
}

  // Função para buscar o slug do tipo de imóvel
  export function buscarSlugTipoImovel(valorExtraido) {
    // Caminho do arquivo de filtros
    const filtroPath = path.resolve(__dirname, '../../../../_03database/filtros/_brTipoImovel.json');
    let filtros;
    try {
      const conteudo = fs.readFileSync(filtroPath, 'utf8');
      filtros = JSON.parse(conteudo);
    } catch (e) {
      console.log('[buscarSlugTipoImovel] Erro ao ler o JSON:', e);
      return valorExtraido.toUpperCase();
    }

    // Normaliza o valor extraído
    const normalizado = valorExtraido
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[.,-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    console.log('[buscarSlugTipoImovel] Valor extraído:', valorExtraido, '| Normalizado:', normalizado);

    // Busca nos objetos (ignora arrays)
    let encontrou = false;
    for (const key in filtros) {
      if (Array.isArray(filtros[key])) continue;
      const grupo = filtros[key];
      for (const slug in grupo) {
        const lista = grupo[slug];
        for (const item of lista) {
          // Normaliza o nome do item
          const nomeNormalizado = item.nome
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '')
            .replace(/[.,-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
          console.log('[buscarSlugTipoImovel] Comparando:', nomeNormalizado, 'com', normalizado);
          if (nomeNormalizado === normalizado) {
            console.log('[buscarSlugTipoImovel] Encontrado slug:', item.slug);
            encontrou = true;
            return item.slug;
          }
        }
      }
    }

    if (!encontrou) {
      console.log('[buscarSlugTipoImovel] Não encontrado, retornando valor em maiúsculas:', valorExtraido.toUpperCase());
    }
    // Não encontrado: retorna valor em maiúsculas
    return valorExtraido.toUpperCase();
  }
