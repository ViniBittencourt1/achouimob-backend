import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { reconciliarVendas } from '../_utils/vendasSincronizacao.js';

let enriched = [];
mock.module('./extractor-00-rotaInterna.js', {
  namedExports: { enrichImoveisWithInternalData: async (_browser, items) => { enriched.push(items); } },
});
const { extractFluxoData, USER_AGENT_FLUXO } = await import('./extractor.js');

function fixture(pages, { total = 16, status = 200, announced = total } = {}) {
  const visited = [];
  let closed = 0;
  const browser = {
    newPage: async () => {
      let url;
      let dom;
      const read = (callback, argument) => {
        const previous = globalThis.document;
        globalThis.document = dom.window.document;
        try { return callback(argument); }
        finally {
          if (previous === undefined) delete globalThis.document;
          else globalThis.document = previous;
        }
      };
      return {
        setUserAgent: async agent => assert.equal(agent, USER_AGENT_FLUXO),
        setExtraHTTPHeaders: async () => {},
        goto: async value => {
          url = new URL(value);
          visited.push(url);
          const ids = pages[url.searchParams.get('ord')]?.[Number(url.searchParams.get('pag')) - 1] ?? [];
          const html = ids.map(id => `<div class="imovelcard">
            <a href="/imovel/${id}/apartamento-venda-centro">Apartamento</a>
            <p class="imovelcard__info__ref"><strong>Ref: ${id === 2 ? 1 : id}</strong> - Apartamento</p>
            </div>`).join('');
          dom = new JSDOM(`<p class="topsearch__total">${announced} imoveis encontrados. Pagina 1</p>${html}`, { url: value });
          return { ok: () => status === 200, status: () => status };
        },
        url: () => url.href,
        title: async () => 'Imoveis Disponiveis',
        $eval: async (selector, callback) => callback(dom.window.document.querySelector(selector)),
        evaluate: async (callback, argument) => read(callback, argument),
        close: async () => { closed++; dom?.window.close(); },
      };
    },
  };
  return { browser, visited, get closed() { return closed; } };
}
const firstPage = Array.from({ length: 15 }, (_, index) => index + 1);

test('paginas ordenadas preservam referencias repetidas em links distintos e reconciliam vendas', async () => {
  enriched = [];
  const f = fixture({ recentes: [firstPage, [16]] });
  const result = await extractFluxoData(f.browser, new Set(['1']), { totalEsperado: 16 });
  assert.equal(result.imoveisRaspados.length, 16);
  assert.equal(result.novosImoveis.length, 14);
  assert.equal(f.closed, 2);
  assert.deepEqual(f.visited.map(url => url.searchParams.get('ord')), ['recentes', 'recentes']);
  const consolidados = new Map(result.imoveisRaspados.map(item => [item.linkReal, item]));
  const synced = reconciliarVendas(result.imoveisRaspados, [], consolidados, 'jfFluxo', {
    totalEsperado: 16, codigoRepetidoPorLink: true,
  });
  assert.equal(synced.ativos.length, 16);
  assert.equal(enriched.length, 1);
});

test('link repetido entre paginas exige recuperar o anuncio faltante em outra ordenacao', async () => {
  enriched = [];
  const f = fixture({ recentes: [firstPage, [15]], menor_valor: [[16]] });
  const result = await extractFluxoData(f.browser, new Set(), { totalEsperado: 16 });
  assert.equal(result.imoveisRaspados.length, 16);
  assert.equal(new Set(result.imoveisRaspados.map(item => item.linkReal)).size, 16);
  assert.deepEqual(f.visited.map(url => url.searchParams.get('ord')), ['recentes', 'recentes', 'menor_valor']);
  assert.equal(enriched[0].length, 16);
});

test('duplicacao persistente nao e aceita como total completo nem inicia rotas internas', async () => {
  enriched = [];
  const f = fixture({
    recentes: [firstPage, [15]], menor_valor: [firstPage, [15]], maior_valor: [firstPage, [15]],
  });
  await assert.rejects(extractFluxoData(f.browser, new Set(), { totalEsperado: 16 }), /15\/16 links unicos/);
  assert.equal(f.closed, 6);
  assert.equal(enriched.length, 0);
});

test('HTTP invalido e mudanca de contagem nao retornam coleta parcial', async () => {
  enriched = [];
  for (const options of [{ status: 403 }, { announced: 17 }]) {
    const f = fixture({ recentes: [firstPage] }, options);
    await assert.rejects(extractFluxoData(f.browser, new Set(), { totalEsperado: 16 }), /HTTP 403|Contagem mudou/);
    assert.equal(f.closed, 1);
  }
  assert.equal(enriched.length, 0);
});

test('zero explicito retorna vazio confirmado sem visitar detalhes', async () => {
  enriched = [];
  const f = fixture({}, { total: 0 });
  const result = await extractFluxoData(f.browser, new Set(), { totalEsperado: 0 });
  assert.deepEqual(result.imoveisRaspados, []);
  assert.equal(result.semImoveisConfirmado, true);
  assert.equal(enriched.length, 0);
});

test('aluguel preserva modalidade e usa a mesma validacao de links unicos', async () => {
  const f = fixture({ recentes: [[1]] }, { total: 1 });
  const result = await extractFluxoData(f.browser, new Set(), {
    baseUrl: 'https://www.fluxoimoveis.com/imovel/locacao', totalEsperado: 1, strict: true,
  });
  assert.equal(result.imoveisRaspados.length, 1);
  assert.equal(f.visited[0].pathname, '/imovel/locacao');
});
