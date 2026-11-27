import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let countOptions;
let extractOptions;
let enrichOptions;
let closed = 0;
const records = [{ linkReal: 'https://universalimoveis.com.br/imovel/1', preco: 1000 }];
mock.module(new URL('../../../services/puppeteerPool.js', import.meta.url), {
  namedExports: { abrirBrowser: async () => ({ close: async () => { closed++; } }) },
});
mock.module(new URL('../_utils/locacaoContagem.js', import.meta.url), {
  namedExports: { contarAntesDaLocacaoPadrao: async (_browser, options) => { countOptions = options; return 1; } },
});
mock.module(new URL('./extractor.js', import.meta.url), {
  namedExports: { extractUniversalData: async (_browser, _urls, options) => { extractOptions = options; return records; } },
});
mock.module(new URL('./extractor-00-rotaInterna.js', import.meta.url), {
  namedExports: { enrichImoveisWithInternalData: async (_browser, items, options) => {
    enrichOptions = options;
    items[0].preco = 99;
    items[0].precoTotal = 1100;
  } },
});
const { collectUniversalRent } = await import('./gcsLocacao.js');
const catalogos = {
  cidades: [{ nome: 'Cidade', slug: 'cidade' }],
  bairros: [{ nome: 'Bairro', slug: 'bairro' }],
  tipos: [{ nome: 'Casa', slug: 'casa' }],
};

test('coleta aluguel sem gravar Sheets e com detalhes e catalogos obrigatorios', async () => {
  const result = await collectUniversalRent({ catalogos });
  assert.equal(countOptions.salvar, false);
  assert.equal(new URL(countOptions.url).searchParams.get('negociacao'), 'locacao');
  assert.equal(extractOptions.catalogos, catalogos);
  assert.equal(extractOptions.totalEsperado, 1);
  assert.deepEqual(enrichOptions, { negociacao: 'aluguel', exigirDetalhes: true });
  assert.equal(result.imoveis[0].preco, 1000);
  assert.equal(result.imoveis[0].precoTotal, 1100);
  assert.equal(closed, 1);
});
