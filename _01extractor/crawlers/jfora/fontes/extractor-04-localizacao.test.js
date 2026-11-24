import assert from 'node:assert/strict';
import test from 'node:test';
import { appendLegacyAddress, extractLegacyAddress } from '../_utils/enrichLegacyAddress.js';

const endereco = 'Avenida do Contorno';
const localizacao = 'Centro, Juiz de Fora, MG';

test('extrai o endereço informado na rota interna do Fontes', () => {
  const html = `<div class="tags" id="desc_tags">
    <p>Código:<b> LOTE 14 - JARDIM PRIMAVERA</b></p>
    <p>Endereço:<b> ${endereco}</b></p>
    <p>Bairro:<b> Jardim Primavera</b></p>
  </div>`;
  assert.equal(extractLegacyAddress(html), endereco);
});

test('anexa o endereço ao final da localização', () => {
  assert.equal(appendLegacyAddress(localizacao, endereco), `${localizacao} - ${endereco}`);
});