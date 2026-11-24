import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { extractAdMyHouseData } from './extractor.js';
import { extractTipoImovel } from './extractor-05-tipoImovel.js';

const venda = 'https://www.admyhouse.com.br/imoveis/a-venda/brasil?order=mais_relevantes';
const aluguel = venda.replace('a-venda', 'para-alugar');

function fixture({ size = 1, locacao = false } = {}) {
  const records = Array.from({ length: size }, (_, id) => ({
    id: id + 1,
    imv_cod_gaia: `AP${id}_ADMY`,
    url_amiga: `https://www.admyhouse.com.br/imovel/apartamento/${locacao ? 'locacao' : 'venda'}/juiz-de-fora/mg/centro/AP${id}_ADMY`,
    imv_titulo: 'Apartamento no Centro',
    imv_preco_venda: 420000,
    imv_preco_locacao: 1800,
    imv_bairro: 'Centro',
    imv_cidade: 'Juiz de Fora',
    imv_estado: 'MG',
    imv_qtd_dorm: 2,
    imv_qtd_banheiros: 1,
    imv_qtd_vagas: 1,
    imv_area_util: 80,
    imv_endereco: 'Rua de teste',
    imv_end_numero: 12,
    imv_hide_address_wl: true,
    fotos: [{ imvft_url: 'https://static.arboimoveis.com.br/foto.jpg' }],
  }));
  const props = {
    count: size,
    locations: records.map(({ id, imv_cod_gaia }) => ({ id, imv_cod_gaia })),
    request_filters: { tipovar: locacao ? 'para-alugar' : 'a-venda', order: 'mais_relevantes' },
    geometry: { location: { lat: 0, lng: 0 } },
    imoveis: [records[0], records[0]],
  };
  const state = {
    props, records, closed: false, requests: [], status: 200, apiStatus: 200,
    finalUrl: locacao ? aluguel : venda,
    heading: `${size} Imoveis ${locacao ? 'para alugar' : 'a venda'}`,
  };
  const page = {
    goto: async () => ({ status: () => state.status }),
    url: () => state.finalUrl,
    close: async () => { state.closed = true; },
    evaluate: async (callback, argument) => {
      const dom = new JSDOM(`<h1 class="Title_resultTitle__test">${state.heading}</h1>`);
      const script = dom.window.document.createElement('script');
      script.id = '__NEXT_DATA__';
      script.textContent = JSON.stringify({ props: { pageProps: props } });
      dom.window.document.body.append(script);
      const previousDocument = globalThis.document;
      const previousFetch = globalThis.fetch;
      globalThis.document = dom.window.document;
      globalThis.fetch = async (value, options) => {
        const url = new URL(value);
        assert.equal(url.origin, 'https://api-site.arboimoveis.com.br');
        assert.equal(options.headers.From, 'NEXT');
        assert.equal(url.searchParams.get('tipovar'), props.request_filters.tipovar);
        const ids = JSON.parse(url.searchParams.get('where')).id.inq;
        state.requests.push(ids);
        return {
          ok: state.apiStatus === 200,
          status: state.apiStatus,
          json: async () => state.records.filter(item => ids.includes(item.id)),
        };
      };
      try { return await callback(argument); }
      finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
        globalThis.fetch = previousFetch;
        dom.window.close();
      }
    },
  };
  return { state, browser: { newPage: async () => page } };
}

test('Arbo busca todos os IDs em lotes, ignora destaques repetidos e normaliza os campos', async () => {
  const { browser, state } = fixture({ size: 51 });
  const result = await extractAdMyHouseData(browser, new Set(['AP0_ADMY']), { totalEsperado: 51 });
  assert.equal(result.imoveisRaspados.length, 51);
  assert.equal(result.novosImoveis.length, 50);
  assert.equal(result.semImoveisConfirmado, false);
  assert.deepEqual(state.requests.map(ids => ids.length), [50, 1]);
  const item = result.imoveisRaspados[0];
  assert.equal(item.preco, 420000);
  assert.equal(item.tipoImovel, 'apartamento');
  assert.equal(item.cidade, 'juiz-de-fora-mg');
  assert.equal(item.bairro, 'centro');
  assert.equal(item.areaValor, '80');
  assert.equal(item.corretor, 'AdMyHouse');
  assert.ok(!item.localizacao.includes('Rua de teste'));
  assert.equal(state.closed, true);
});

test('aluguel e venda-e-locacao usam preco da modalidade, sem taxa de condominio', async () => {
  const { browser, state } = fixture({ locacao: true });
  state.records[0].url_amiga = state.records[0].url_amiga.replace('/locacao/', '/venda-e-locacao/');
  state.records[0].imv_preco_cond = 500;
  assert.equal((await extractAdMyHouseData(browser, new Set(), { baseUrl: aluguel })).imoveisRaspados[0].preco, 1800);
  assert.equal(extractTipoImovel('', state.records[0].url_amiga), 'apartamento');
  assert.equal(extractTipoImovel('', 'https://www.admyhouse.com.br/imovel/1/apartamento-venda-centro'), 'apartamento');
});

for (const locacao of [false, true]) {
  test(`atualizadoEm registra a coleta em Sao Paulo, nao updatedAt da API (${locacao ? 'aluguel' : 'venda'})`, async context => {
    context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-30T14:41:38.000Z') });
    const { browser, state } = fixture({ size: 2, locacao });
    state.records[0].updatedAt = '2026-10-28T17:42:04.000Z';
    state.records[1].updatedAt = '2026-10-15T00:38:59.000Z';
    const options = { baseUrl: locacao ? aluguel : venda };
    const codigos = new Set(state.records.map(item => item.imv_cod_gaia));
    const result = await extractAdMyHouseData(browser, codigos, options);
    assert.deepEqual(result.imoveisRaspados.map(item => item.atualizadoEm), [
      '30/10/2026 11:41:38', '30/10/2026 11:41:38',
    ]);
    assert.equal(result.novosImoveis.length, 0);
    context.mock.timers.tick(60000);
    const atualizado = await extractAdMyHouseData(browser, codigos, options);
    assert.deepEqual(atualizado.imoveisRaspados.map(item => item.atualizadoEm), [
      '30/10/2026 11:42:38', '30/10/2026 11:42:38',
    ]);
  });
}

test('zero exige cabecalho e IDs coerentes; pagina inicial nao equivale a catalogo vazio', async () => {
  const { browser, state } = fixture({ size: 0 });
  assert.equal((await extractAdMyHouseData(browser)).semImoveisConfirmado, true);
  assert.equal(state.requests.length, 0);
  state.heading = 'Para voce morar bem';
  await assert.rejects(extractAdMyHouseData(browser), /Contagem ou IDs invalidos/);
});

for (const [name, change, error] of [
  ['HTTP 403', s => { s.status = 403; }, /HTTP 403/],
  ['API indisponivel', s => { s.apiStatus = 503; }, /API HTTP 503/],
  ['redirecionamento para inicio', s => { s.finalUrl = 'https://www.admyhouse.com.br/'; }, /redirecionada/],
  ['IDs ausentes', s => { s.props.locations = []; }, /Contagem ou IDs invalidos/],
  ['IDs repetidos', s => { s.props.locations[1] = s.props.locations[0]; }, /Contagem ou IDs invalidos/],
  ['cabecalho de aluguel em vendas', s => { s.heading = '2 Imoveis para alugar'; }, /Contagem ou IDs invalidos/],
  ['API parcial', s => { s.records.pop(); }, /catalogo parcial/],
  ['codigo divergente', s => { s.records[0].imv_cod_gaia = 'outro'; }, /catalogo parcial/],
  ['links repetidos', s => { s.records[1].url_amiga = s.records[0].url_amiga; }, /links duplicados/],
  ['anuncio externo', s => { s.records[0].url_amiga = s.records[0].url_amiga.replace('www.admyhouse.com.br', 'example.com'); }, /fora da negociacao/],
  ['anuncio de aluguel em vendas', s => { s.records[0].url_amiga = s.records[0].url_amiga.replace('/venda/', '/locacao/'); }, /fora da negociacao/],
  ['preco invalido', s => { s.records[0].imv_preco_venda = null; }, /Preco invalido/],
]) {
  test(`${name} interrompe a coleta e fecha a pagina`, async () => {
    const { browser, state } = fixture({ size: 2 });
    change(state);
    await assert.rejects(extractAdMyHouseData(browser), error);
    assert.equal(state.closed, true);
  });
}

test('mudanca da precontagem impede resultado; preco oculto permanece nulo', async () => {
  const { browser, state } = fixture();
  await assert.rejects(extractAdMyHouseData(browser, new Set(), { totalEsperado: 2 }), /Contagem mudou/);
  state.records[0].imv_ocultar_preco = true;
  assert.equal((await extractAdMyHouseData(browser)).imoveisRaspados[0].preco, null);
});
