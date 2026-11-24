import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapImovelHolder, partesDoSlug } from './extractor.js';
import { extractPreco } from './extractor-03-preco.js';

const item = {
  id: 'd44977f4-5c51-4d61-b837-bb4c43dfad0f',
  price: 'R$690.000,00',
  transaction: 'VENDA',
  reference: '149',
  address: { formatted: 'Centro - Juiz de Fora/MG, central' },
  areas: { primary_area: { value: '162' }, total_area: { value: '170' } },
  rooms: { bedroom: { value: 3 }, bathroom: { value: 3 }, garage: { value: 1 }, livingroom: { value: 1 } },
  title_formatted: 'Apartamento em Centro, Juiz de Fora/MG',
  url: 'apartamento-a-venda-no-bairro-centro-em-juiz-de-fora-mg/149',
  images: [{ file_url: { medium: 'https://imagens.tecimob.com.br/foto.webp' } }],
};

test('slug Tecimob separa tipo, bairro e cidade', () => {
  assert.deepEqual(partesDoSlug('terreno-a-venda-no-bairro-granjas-guaruja-em-juiz-de-fora-mg/132'), { tipo: 'terreno', bairro: 'granjas-guaruja', cidade: 'juiz-de-fora-mg' });
  assert.deepEqual(partesDoSlug('casa-para-alugar-no-bairro-passos-em-juiz-de-fora-mg/148'), { tipo: 'casa', bairro: 'passos', cidade: 'juiz-de-fora-mg' });
});

test('mapeia aluguel da Holder preservando centavos', () => {
  const imovel = mapImovelHolder({ ...item, transaction: 'ALUGUEL', price: 'R$3.484,50', url: 'casa-para-alugar-no-bairro-passos-em-juiz-de-fora-mg/148' }, '09/10/2026 10:00:00', 'locacao');
  assert.equal(imovel.preco, 3484.5);
  assert.equal(imovel.tipoImovel, 'casa');
  assert.throws(() => mapImovelHolder(item, undefined, 'locacao'), /fora da locacao/);
});

test('mapeia imovel de venda da Holder nos 20 campos padrao', () => {
  const imovel = mapImovelHolder(item, '09/10/2026 10:00:00');
  assert.equal(Object.keys(imovel).length, 20);
  assert.equal(imovel.linkReal, 'https://holderimob.com.br/imovel/apartamento-a-venda-no-bairro-centro-em-juiz-de-fora-mg/149');
  assert.equal(imovel.preco, 690000);
  assert.equal(imovel.tipoImovel, 'apartamento');
  assert.equal(imovel.bairro, 'centro');
  assert.equal(imovel.cidade, 'juiz-de-fora-mg');
  assert.deepEqual([imovel.dormitorioValor, imovel.banheiroValor, imovel.garagemValor, imovel.areaValor], [3, 3, 1, 162]);
  assert.equal(imovel.codigoBase, '149');
  assert.equal(imovel.corretor, 'Holder');
  assert.equal(imovel.linkFoto, 'https://imagens.tecimob.com.br/foto.webp');
  assert.equal(imovel.atualizadoEm, '09/10/2026 10:00:00');
});

test('rejeita imovel de aluguel e trata preco sob consulta', () => {
  assert.throws(() => mapImovelHolder({ ...item, transaction: 'ALUGUEL' }), /fora da venda/);
  assert.equal(extractPreco('Sob consulta'), 0);
  assert.equal(extractPreco('A partir de R$ 450.000,00'), 450000);
});
