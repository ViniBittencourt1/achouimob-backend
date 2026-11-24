const assert = require('node:assert/strict');
const { test } = require('node:test');
const { projectImovelForTypesense } = require('./projectImovelForTypesense.cjs');

test('mantem as taxas numericas e calcula precoTotal para registros antigos', () => {
  const record = projectImovelForTypesense({
    linkReal: 'https://example.com/imovel/1',
    preco: 4000,
    precoCondominio: 1300,
    precoIptu: 390,
    precoOutros: 360,
    precoTotal: 6050,
    negociacao: 'locacao',
  });
  assert.equal(record.preco, 4000);
  assert.equal(record.precoCondominio, 1300);
  assert.equal(record.precoIptu, 390);
  assert.equal(record.precoOutros, 360);
  assert.equal(record.precoTotal, 6050);
  const legacy = projectImovelForTypesense({ linkReal: 'https://example.com/imovel/2', preco: 1250, negociacao: 'locacao' });
  assert.equal(legacy.precoCondominio, 0);
  assert.equal(legacy.precoIptu, 0);
  assert.equal(legacy.precoOutros, 0);
  assert.equal(legacy.precoTotal, 1250);

  const siteTotalWithoutRent = projectImovelForTypesense({
    linkReal: 'https://example.com/imovel/3',
    preco: null,
    precoCondominio: 0,
    precoIptu: 0,
    precoOutros: 0,
    precoTotal: 2250,
    negociacao: 'locacao',
  });
  assert.equal(siteTotalWithoutRent.precoTotal, 2250);

  const unknownPrice = projectImovelForTypesense({ linkReal: 'https://example.com/imovel/4', preco: null, negociacao: 'locacao' });
  assert.equal(unknownPrice.precoTotal, undefined);
  assert.equal(Object.hasOwn(projectImovelForTypesense({ linkReal: 'https://example.com/imovel/5', preco: 400000, negociacao: 'venda' }), 'precoCondominio'), false);
});
