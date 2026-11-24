import assert from 'node:assert/strict';
import test from 'node:test';
import { appendLegacyAddress, extractLegacyAddress } from '../_utils/enrichLegacyAddress.js';

const endereco = 'R. Pref. Luiz Penna, 0';
const localizacao = 'Bairro, Juiz de Fora, MG';

test('extrai o endereço informado na rota interna do Fluxo', () => {
  assert.equal(extractLegacyAddress(`<p>Endereço:<b> ${endereco}</b></p>`), endereco);
});

test('anexa o endereço ao final da localização', () => {
  assert.equal(appendLegacyAddress(localizacao, endereco), `${localizacao} - ${endereco}`);
});