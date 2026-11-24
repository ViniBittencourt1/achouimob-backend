import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const calls = [];
let total = 1;
let failure;
const item = { linkReal: 'https://www.mouraimoveisjf.com.br/imovel/teste', codigoBase: 'AP1', preco: 100000 };
mock.module('../../../services/puppeteerPool.js', {
  namedExports: { abrirBrowser: async options => {
    assert.deepEqual(options, { headlessOverride: true });
    return { close: async () => calls.push('close') };
  } },
});
mock.module('../../../services/crawlerJson.js', {
  namedExports: { getCollectionAsMap: async () => new Map() },
});
mock.module('../_utils/vendasContagem.js', {
  namedExports: { contarAntesDasVendas: async () => { calls.push('count'); return total; } },
});
mock.module('../_utils/vendasSincronizacao.js', {
  namedExports: { sincronizarVendas: async options => calls.push(['sync', options]) },
});
mock.module('./extractor.js', {
  namedExports: { extractLocalData: async (_browser, _links, options) => {
    calls.push(['extract', options]);
    if (failure) throw failure;
    return total ? [item] : [];
  } },
});
mock.module('./extractor-00-rotaExterna.js', {
  namedExports: { linksBusca: ['https://www.mouraimoveisjf.com.br/imoveis/a-venda'] },
});
mock.module('./parser.js', {
  namedExports: { consolidateData: items => {
    calls.push('consolidate');
    return new Map(items.map(value => [value.linkReal, value]));
  } },
});
mock.module('./sheets.js', { namedExports: { exportToSheets: async () => {} } });
mock.module('../../_cards/extractorCard1.js', {
  namedExports: { extractCard1: async () => calls.push('card') },
});
const { main } = await import('./index.js');

test('Moura passa precontagem para a coleta e sincroniza somente apos fechar navegador', async () => {
  calls.length = 0;
  await main();
  assert.deepEqual(calls.find(value => value[0] === 'extract')[1], { totalEsperado: 1 });
  const syncIndex = calls.findIndex(value => value[0] === 'sync');
  assert.ok(calls.indexOf('close') < syncIndex);
  assert.equal(calls[syncIndex][1].totalEsperado, 1);
  assert.equal(calls[syncIndex][1].vazioConfirmado, false);
});

test('Moura fecha navegador e nao consolida nem salva quando a coleta falha', async () => {
  calls.length = 0;
  failure = new Error('Paginacao incompleta; base preservada.');
  try {
    await assert.rejects(main(), /Paginacao incompleta/);
    assert.ok(calls.includes('close'));
    assert.ok(!calls.includes('consolidate'));
    assert.ok(!calls.some(value => value[0] === 'sync'));
    assert.ok(!calls.includes('card'));
  } finally { failure = undefined; }
});

test('Moura sincroniza vazio somente com contagem zero e coleta bem-sucedida', async () => {
  calls.length = 0;
  total = 0;
  try {
    await main();
    const sync = calls.find(value => value[0] === 'sync')[1];
    assert.equal(sync.totalEsperado, 0);
    assert.equal(sync.vazioConfirmado, true);
    assert.deepEqual(sync.imoveisRaspados, []);
  } finally { total = 1; }
});
