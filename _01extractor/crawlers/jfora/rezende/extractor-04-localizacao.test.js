import assert from 'node:assert/strict';
import test from 'node:test';
import { adicionarRuaNaLocalizacao, extractRuaFromHtml } from './extractor-04-localizacao.js';

const htmlDetalhe = `
  <div class="imovel--location">
    <div class="imovel--location--address">
      <a href="https://www.google.com/maps/place/teste">Rua Santo Antônio, Centro, Juiz de Fora, MG, 36016-210</a>
    </div>
  </div>
`;

test('extrai o endereço completo da localização interna', () => {
  assert.equal(extractRuaFromHtml(htmlDetalhe), 'Rua Santo Antônio, Centro, Juiz de Fora, MG, 36016-210');
});

test('adiciona o endereço ao final sem apagar nem duplicar a localização existente', () => {
  const localizacao = 'Cond. Ed. José Augusto Alves no bairro Centro, Juiz de Fora, MG';
  const endereco = 'Rua Santo Antônio, Centro, Juiz de Fora, MG, 36016-210';
  const localizacaoComEndereco = `${localizacao} - ${endereco}`;

  assert.equal(adicionarRuaNaLocalizacao(localizacao, endereco), localizacaoComEndereco);
  assert.equal(adicionarRuaNaLocalizacao(localizacaoComEndereco, endereco), localizacaoComEndereco);
  assert.equal(adicionarRuaNaLocalizacao(localizacao, ''), localizacao);
});