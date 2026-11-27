import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let countOptions;
let extractOptions;
let detailOptions;
let closed = 0;
let failDetails = false;
mock.module(new URL('../../../services/puppeteerPool.js', import.meta.url), {
  namedExports: { abrirBrowser: async () => ({ close: async () => { closed++; } }) },
});
mock.module(new URL('../_utils/vendasContagem.js', import.meta.url), {
  namedExports: { contarAntesDasVendas: async (_browser, options) => { countOptions = options; return 1; } },
});
mock.module(new URL('../_utils/vendasPadraoPaginacao.js', import.meta.url), {
  namedExports: { rotaVendasPadrao: () => 'https://grupoalmar.com.br/imoveis?negociacao=venda' },
});
mock.module(new URL('../_utils/locacaoContagem.js', import.meta.url), {
  namedExports: { contarAntesDaLocacaoPadrao: async (_browser, options) => { countOptions = options; return 1; } },
});
mock.module(new URL('./extractor.js', import.meta.url), {
  namedExports: { extractAlmarData: async (_browser, _urls, options) => {
    extractOptions = options;
    return [{ linkReal: 'https://grupoalmar.com.br/imovel/1', preco: 1000 }];
  } },
});
mock.module(new URL('./extractor-00-rotaInterna.js', import.meta.url), {
  namedExports: { enrichImoveisWithInternalData: async (_browser, items, options) => {
    detailOptions = options;
    if (failDetails) throw new Error('Detalhes incompletos');
    items[0].preco = 99;
  } },
});
const { collectAlmarGcs } = await import('./gcs.js');
const catalogos = {
  cidades: [{ nome: 'Cidade', slug: 'cidade' }],
  bairros: [{ nome: 'Bairro', slug: 'bairro' }],
  tipos: [{ nome: 'Casa', slug: 'casa' }],
};

test('coleta Almar usa catalogos, contagem sem Sheets e detalhes estritos', async () => {
  for (const negociacao of ['venda', 'aluguel']) {
    closed = 0;
    const result = await collectAlmarGcs({ catalogos, negociacao });
    assert.equal(countOptions.salvar, false);
    assert.equal(extractOptions.catalogos, catalogos);
    assert.equal(extractOptions.totalEsperado, 1);
    assert.equal(extractOptions.negociacao, negociacao === 'aluguel' ? 'locacao' : 'venda');
    assert.equal(detailOptions.exigirDetalhes, true);
    if (negociacao === 'aluguel') assert.equal(result.imoveis[0].preco, 1000);
    assert.equal(closed, 1);
  }
});

test('falha nos detalhes fecha o navegador e interrompe a coleta', async () => {
  closed = 0;
  failDetails = true;
  try {
    await assert.rejects(collectAlmarGcs({ catalogos, negociacao: 'aluguel' }), /Detalhes incompletos/);
    assert.equal(closed, 1);
  } finally { failDetails = false; }
});
