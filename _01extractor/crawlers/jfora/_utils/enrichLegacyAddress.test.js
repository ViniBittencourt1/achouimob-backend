import assert from 'node:assert/strict';
import test from 'node:test';
import { appendLegacyAddress, extractLegacyAddress } from './enrichLegacyAddress.js';

const endereco = 'Rua Justino Gomes Monteiro, 380';
const localizacao = 'Centro, Juiz de Fora, MG';

test('extrai Endereço do padrão antigo', () => {
  assert.equal(extractLegacyAddress(`<p>Endereço:<b> ${endereco}</b></p>`), endereco);
});

test('anexa endereço sem apagar nem duplicar', () => {
  const resultado = `${localizacao} - ${endereco}`;
  assert.equal(appendLegacyAddress(localizacao, endereco), resultado);
  assert.equal(appendLegacyAddress(resultado, endereco), resultado);
});