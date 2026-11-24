import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let countOptions;
let records;
let enriched;
let enrichOptions;
let extractOptions;
let closed;
const browser = { close: async () => { closed++; } };
mock.module(new URL('../../../services/puppeteerPool.js', import.meta.url), {
  namedExports: { abrirBrowser: async () => browser },
});
mock.module(new URL('../_utils/vendasContagem.js', import.meta.url), {
  namedExports: { contarAntesDasVendas: async (_browser, options) => { countOptions = options; return records.length; } },
});
mock.module(new URL('../_utils/vendasPadraoPaginacao.js', import.meta.url), {
  namedExports: { rotaVendasPadrao: () => 'https://universalimoveis.com.br/imoveis?negociacao=venda' },
});
mock.module(new URL('./extractor.js', import.meta.url), {
  namedExports: { extractUniversalData: async (_browser, _links, options) => { extractOptions = options; return records; } },
});
mock.module(new URL('./extractor-00-rotaInterna.js', import.meta.url), {
  namedExports: { enrichImoveisWithInternalData: async (_browser, _records, options) => { enriched++; enrichOptions = options; } },
});
const { collectUniversalSales } = await import('./gcsVendas.js');
const catalogos = {
  cidades: [{ nome: 'Cidade', slug: 'cidade' }],
  bairros: [{ nome: 'Bairro', slug: 'bairro' }],
  tipos: [{ nome: 'Casa', slug: 'casa' }],
};

test('coleta piloto desativa efeitos da contagem e fecha navegador', async () => {
  records = [{ linkReal: 'https://universalimoveis.com.br//imovel/1' }];
  closed = 0;
  enriched = 0;
  const result = await collectUniversalSales({ catalogos });
  assert.deepEqual(countOptions, { projeto: 'jfUniversal', salvar: false });
  assert.equal(result.totalEsperado, 1);
  assert.equal(extractOptions.catalogos, catalogos);
  assert.equal(extractOptions.liberarMemoria, true);
  assert.equal(enriched, 1);
  assert.deepEqual(enrichOptions, { exigirDetalhes: true });
  assert.equal(closed, 1);
});

test('link fora do site interrompe antes dos detalhes e fecha navegador', async () => {
  records = [{ linkReal: 'https://outro-site.com/imovel/1' }];
  closed = 0;
  enriched = 0;
  await assert.rejects(collectUniversalSales({ catalogos }), /fora do site/);
  assert.equal(enriched, 0);
  assert.equal(closed, 1);
});

test('catalogos ausentes impedem abertura do navegador', async () => {
  closed = 0;
  await assert.rejects(collectUniversalSales(), /Catalogos do GCS/);
  assert.equal(closed, 0);
});
