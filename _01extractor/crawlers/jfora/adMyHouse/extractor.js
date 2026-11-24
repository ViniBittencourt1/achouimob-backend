import { extractTipoImovel } from './extractor-05-tipoImovel.js';
import { extractAtualizadoEm } from './extractor-20-atualizadoEm.js';
import { extractCidadeFromCardHtml } from '../acervo/extractor-07-cidade.js';
import { resolverBairroCatalogo } from '../_utils/bairroCatalogo.js';

const BASE_URL = 'https://www.admyhouse.com.br/imoveis/a-venda/brasil?order=mais_relevantes';

export async function extractAdMyHouseData(browser, existingCodigoBaseSet = new Set(), options = {}) {
  const url = new URL(options.baseUrl ?? BASE_URL);
  const aluguel = url.pathname === '/imoveis/para-alugar/brasil';
  const tipovar = aluguel ? 'para-alugar' : 'a-venda';
  if (url.hostname !== 'www.admyhouse.com.br' || url.pathname !== `/imoveis/${tipovar}/brasil`) {
    throw new Error('[AdMyHouse] Rota de busca invalida; base preservada.');
  }
  const page = await browser.newPage();
  try {
    const response = await page.goto(url.href, { waitUntil: 'networkidle2', timeout: 90000 });
    const status = response?.status() ?? 0;
    if (status < 200 || status >= 400) {
      const error = new Error(`[AdMyHouse] HTTP ${status} na busca; base preservada.`);
      if (status === 403 || status === 429) error.code = 'ADMYHOUSE_BLOCKED';
      throw error;
    }
    const finalUrl = new URL(page.url());
    if (finalUrl.origin !== url.origin || finalUrl.pathname !== url.pathname) {
      throw new Error('[AdMyHouse] Busca redirecionada; base preservada.');
    }
    const { total, records } = await page.evaluate(async (negociacao) => {
      const props = JSON.parse(document.querySelector('#__NEXT_DATA__')?.textContent || '{}').props?.pageProps;
      const heading = document.querySelector('h1[class*="Title_resultTitle__"]')?.textContent
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      const pattern = negociacao === 'para-alugar'
        ? /^(\d[\d.]*)\s+Imove(?:l|is) para alugar$/i
        : /^(\d[\d.]*)\s+Imove(?:l|is) a venda$/i;
      const match = heading?.match(pattern);
      const total = props?.count;
      if (!Number.isSafeInteger(total) || total < 0 || !match ||
          Number(match[1].replace(/\./g, '')) !== total || props.request_filters?.tipovar !== negociacao ||
          !Array.isArray(props.locations) || props.locations.length !== total ||
          props.locations.some(item => !Number.isSafeInteger(item.id) || !item.imv_cod_gaia) ||
          new Set(props.locations.map(item => item.id)).size !== total ||
          new Set(props.locations.map(item => item.imv_cod_gaia)).size !== total) {
        throw new Error('[AdMyHouse] Contagem ou IDs invalidos na busca; base preservada.');
      }
      const records = [];
      // A lista SSR pode trazer destaques duplicados; os IDs do mapa delimitam o catalogo.
      for (let offset = 0; offset < total; offset += 50) {
        const batch = props.locations.slice(offset, offset + 50);
        const params = new URLSearchParams({
          where: JSON.stringify({ id: { inq: batch.map(item => item.id) } }),
          order: props.request_filters.order,
          tipovar: negociacao,
          center: JSON.stringify(props.geometry?.location || {}),
        });
        const response = await fetch(`https://api-site.arboimoveis.com.br/api/imoveis-replica/get-imoveis-new?${params}`, {
          headers: { From: 'NEXT', 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(45000),
        });
        if (!response.ok) throw new Error(`[AdMyHouse] API HTTP ${response.status}; base preservada.`);
        const items = await response.json();
        const expected = new Map(batch.map(item => [item.id, item.imv_cod_gaia]));
        if (!Array.isArray(items) || items.length !== batch.length ||
            new Set(items.map(item => item.id)).size !== batch.length ||
            items.some(item => !expected.has(item.id) || expected.get(item.id) !== item.imv_cod_gaia)) {
          throw new Error('[AdMyHouse] API retornou catalogo parcial ou divergente; base preservada.');
        }
        records.push(...items);
      }
      return { total, records };
    }, tipovar);
    if (options.totalEsperado !== undefined && total !== options.totalEsperado) {
      throw new Error(`[AdMyHouse] Contagem mudou de ${options.totalEsperado} para ${total}; base preservada.`);
    }
    const agora = new Date().toISOString();
    const atualizadoEm = extractAtualizadoEm();
    const imoveisRaspados = records.map(item => {
      const link = new URL(item.url_amiga);
      const negocio = aluguel ? 'locacao' : 'venda';
      if (link.origin !== url.origin || !new RegExp(`^/imovel/[^/]+/(?:${negocio}|venda-e-locacao)/`).test(link.pathname)) {
        throw new Error('[AdMyHouse] Anuncio fora da negociacao ou do site; base preservada.');
      }
      const preco = item.imv_ocultar_preco ? null : Number(aluguel ? item.imv_preco_locacao : item.imv_preco_venda);
      if (preco !== null && (!Number.isFinite(preco) || preco <= 0)) {
        throw new Error(`[AdMyHouse] Preco invalido em ${item.imv_cod_gaia}; base preservada.`);
      }
      const cidade = extractCidadeFromCardHtml('', link.href);
      const bairro = resolverBairroCatalogo(item.imv_bairro, cidade);
      const endereco = item.imv_hide_address_wl || item.imobiliaria?.imb_hidden_address
        ? '' : [item.imv_endereco, item.imv_end_numero].filter(Boolean).join(', ');
      return {
        linkReal: link.href,
        titulo: item.imv_titulo,
        preco,
        localizacao: [item.imv_bairro, [item.imv_cidade, item.imv_estado].filter(Boolean).join('/'), endereco].filter(Boolean).join(' - '),
        tipoImovel: extractTipoImovel('', link.href),
        bairro,
        cidade,
        dormitorioValor: Number(item.imv_qtd_dorm) || 0,
        banheiroValor: Number(item.imv_qtd_banheiros) || 0,
        ambienteValor: 0,
        areaValor: String(Number(item.imv_area_util) || 0),
        garagemValor: Number(item.imv_qtd_vagas) || 0,
        elevadorValor: 0,
        codigoBase: item.imv_cod_gaia,
        linkCard: link.href,
        corretor: 'AdMyHouse',
        dataInclusao: agora,
        dataExclusao: '',
        linkFoto: item.fotos?.[0]?.imvft_url || '',
        atualizadoEm,
      };
    });
    if (imoveisRaspados.length !== total || new Set(imoveisRaspados.map(item => item.linkReal)).size !== total) {
      throw new Error('[AdMyHouse] Coleta incompleta ou links duplicados; base preservada.');
    }
    console.log(`[AdMyHouse] ${imoveisRaspados.length}/${total} imoveis extraidos.`);
    return {
      imoveisRaspados,
      novosImoveis: imoveisRaspados.filter(item => !existingCodigoBaseSet.has(String(item.codigoBase))),
      semImoveisConfirmado: total === 0,
    };
  } finally {
    await page.close();
  }
}
