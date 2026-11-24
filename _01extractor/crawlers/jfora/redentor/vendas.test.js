import assert from 'node:assert/strict';
import { test } from 'node:test';
import { linksBusca } from './extractor-00-rotaExterna.js';
import { extractRedentorData } from './extractor.js';
import { projetoContagemVendas } from '../_utils/vendasContagemProjetos.js';

test('Redentor coleta o mesmo universo da precontagem sem faixas de preco', () => {
  assert.equal(linksBusca.length, 1);
  const url = new URL(linksBusca[0]);
  const contagem = new URL(projetoContagemVendas('jfRedentor').url);
  assert.equal(url.origin, contagem.origin);
  assert.equal(url.pathname, contagem.pathname);
  assert.equal(url.searchParams.get('negociacao'), contagem.searchParams.get('negociacao'));
  assert.equal(url.searchParams.get('order'), 'recentes');
  assert.equal(url.searchParams.has('preco_min'), false);
  assert.equal(url.searchParams.has('preco_max'), false);
  assert.equal([...url.searchParams.keys()].length, 2);
});

test('Redentor rejeita coleta incompleta antes de visitar os detalhes', async () => {
  await assert.rejects(extractRedentorData({}, [], { totalEsperado: 1 }), /Coleta incompleta: 0\/1.*detalhes nao serao visitados/);
  assert.deepEqual(await extractRedentorData({}, [], { totalEsperado: 0 }), []);
});