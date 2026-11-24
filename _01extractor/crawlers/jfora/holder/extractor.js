import fs from 'node:fs';
import { resolverBairroCatalogo, normalizarBairro } from '../_utils/bairroCatalogo.js';
import { resolverTipoCatalogo } from '../_1Jf/tipos-alugueis.js';
import { extractPreco } from './extractor-03-preco.js';
import { extractAtualizadoEm } from './extractor-20-atualizadoEm.js';

const ORIGEM = 'https://holderimob.com.br';
export const URL_VENDAS_HOLDER = `${ORIGEM}/comprar/imoveis?sort=-created_at%2Cid&typeArea=total_area&floorComparision=equals`;
export const URL_LOCACAO_HOLDER = `${ORIGEM}/alugar/imoveis?sort=-created_at%2Cid&typeArea=total_area&floorComparision=equals`;
const MODOS = {
  venda: { url: URL_VENDAS_HOLDER, transacao: /venda/i, rotulo: 'Holder' },
  locacao: { url: URL_LOCACAO_HOLDER, transacao: /aluguel|loca/i, rotulo: 'HolderLocacao' },
};
const LIMITE = 21;
const MAX_PAGINAS = 100;

const bairros = JSON.parse(fs.readFileSync(new URL('../../../../_03database/filtros/_jfBairros.json', import.meta.url), 'utf8'));

// Slug Tecimob: "{tipo}-a-venda|para-alugar-no-bairro-{bairro}-em-{cidade}-{uf}/{id}".
export function partesDoSlug(url) {
  const match = String(url ?? '').match(/^([a-z0-9-]+?)-(?:a-venda|para-alugar)-no-bairro-([a-z0-9-]+)-em-([a-z0-9-]+-[a-z]{2})\/\d+$/i);
  return match ? { tipo: match[1], bairro: match[2], cidade: match[3].toLowerCase() } : { tipo: '', bairro: '', cidade: '' };
}

const numero = value => Number(String(value ?? '').replace(',', '.')) || 0;

export function mapImovelHolder(item, atualizadoEm = extractAtualizadoEm(), modo = 'venda') {
  if (!item?.url || !MODOS[modo].transacao.test(item.transaction ?? '')) throw new Error(`[Holder] Imovel fora da ${modo} ou sem URL: ${item?.reference ?? '?'}.`);
  const slug = partesDoSlug(item.url);
  const cidade = slug.cidade;
  const bairroCatalogo = resolverBairroCatalogo(slug.bairro, cidade);
  const bairroValido = bairroCatalogo && bairros.some(bairro => bairro.slug === bairroCatalogo && normalizarBairro(bairro.cidade) === normalizarBairro(cidade));
  const rooms = item.rooms ?? {};
  const areas = item.areas ?? {};
  return {
    linkReal: `${ORIGEM}/imovel/${item.url}`,
    titulo: item.title_formatted || item.meta_title || '',
    preco: extractPreco(item.price, modo),
    localizacao: item.address?.formatted || '',
    tipoImovel: resolverTipoCatalogo(slug.tipo) || slug.tipo,
    bairro: bairroValido ? bairroCatalogo : slug.bairro,
    cidade,
    dormitorioValor: numero(rooms.bedroom?.value),
    banheiroValor: numero(rooms.bathroom?.value),
    ambienteValor: numero(rooms.livingroom?.value),
    areaValor: numero(areas.primary_area?.value) || numero(areas.total_area?.value),
    garagemValor: numero(rooms.garage?.value),
    elevadorValor: 0,
    codigoBase: String(item.reference ?? ''),
    linkCard: 0,
    corretor: 'Holder',
    dataInclusao: new Date().toISOString().split('T')[0],
    dataExclusao: '',
    linkFoto: item.images?.[0]?.file_url?.medium || item.images?.[0]?.file_url?.large || '',
    atualizadoEm,
  };
}

function urlPagina(pagina, modo) {
  const url = new URL(MODOS[modo].url);
  url.searchParams.set('offset', String(pagina));
  url.searchParams.set('limit', String(LIMITE));
  return url.href;
}

// A listagem e Next.js: os imoveis da pagina vem no estado inicial (__NEXT_DATA__).
async function lerPagina(page, pagina, modo = 'venda') {
  const response = await page.goto(urlPagina(pagina, modo), { waitUntil: 'networkidle2', timeout: 90000 });
  const status = response?.status() ?? 0;
  if (status < 200 || status >= 400) {
    const error = new Error(`[Holder] HTTP ${status} na pagina ${pagina}.`);
    if (status === 403 || status === 429) error.code = 'HOLDER_BLOCKED';
    throw error;
  }
  if (new URL(page.url()).pathname !== new URL(MODOS[modo].url).pathname) throw new Error(`[Holder] Busca redirecionada para fora de ${modo}.`);
  const estado = await page.evaluate(() => {
    const data = JSON.parse(document.getElementById('__NEXT_DATA__')?.textContent || '{}');
    return data?.props?.initialState?.properties ?? null;
  });
  if (!estado || !Array.isArray(estado.data)) throw new Error(`[Holder] Dados da listagem ausentes na pagina ${pagina}.`);
  return { itens: estado.data, paginacao: estado.meta?.pagination ?? {} };
}

export async function contarHolder(browser, modo = 'venda') {
  const page = await browser.newPage();
  try {
    const total = Number((await lerPagina(page, 1, modo)).paginacao.total);
    if (!Number.isSafeInteger(total) || total < 0) throw new Error('[Holder] Total da listagem invalido.');
    return total;
  } finally {
    await page.close();
  }
}

export async function extractHolderData(browser, existingCodigoBaseSet = new Set(), { modo = 'venda' } = {}) {
  const { rotulo } = MODOS[modo];
  const page = await browser.newPage();
  const registros = new Map();
  let total;
  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
      const { itens, paginacao } = await lerPagina(page, pagina, modo);
      if (total === undefined) total = Number(paginacao.total);
      if (!Number.isInteger(total) || total < 0) throw new Error('[Holder] Total da listagem invalido.');
      if (Number(paginacao.total) !== total) throw new Error('[Holder] Total mudou durante a paginacao; coleta parcial nao sera salva.');
      const antes = registros.size;
      for (const item of itens) registros.set(item.id ?? item.url, item);
      console.log(`[${rotulo}] Pagina ${pagina}/${paginacao.total_pages ?? '?'}: ${registros.size}/${total} imoveis unicos.`);
      if (registros.size >= total || pagina >= Number(paginacao.total_pages || 0)) break;
      if (registros.size === antes) throw new Error('[Holder] Paginacao sem novos imoveis; coleta parcial nao sera salva.');
    }
  } finally {
    await page.close();
  }
  if (registros.size !== total) throw new Error(`[Holder] Coleta ${registros.size} difere do total ${total}; base preservada.`);
  const atualizadoEm = extractAtualizadoEm();
  const imoveisRaspados = Array.from(registros.values(), item => mapImovelHolder(item, atualizadoEm, modo));
  return {
    imoveisRaspados,
    novosImoveis: imoveisRaspados.filter(item => !existingCodigoBaseSet.has(String(item.codigoBase))),
  };
}
