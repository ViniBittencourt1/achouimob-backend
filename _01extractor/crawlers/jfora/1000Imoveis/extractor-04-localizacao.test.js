import assert from 'node:assert/strict';
import test from 'node:test';
import { adicionarEnderecoNaLocalizacao, extractEnderecoFromHtml } from './extractor-04-localizacao.js';

const htmlDetalhe = `
  <div class="imovel--location--address">
    <a href="https://www.google.com/maps/place/teste">Rua Doná Zéca, Shangrilla, Goianá, MG, 36152-000</a>
  </div>
`;

test('extrai o endereço completo da localização interna', () => {
  assert.equal(extractEnderecoFromHtml(htmlDetalhe), 'Rua Doná Zéca, Shangrilla, Goianá, MG, 36152-000');
});

test('adiciona o endereço ao final sem apagar nem duplicar a localização existente', () => {
  const localizacao = 'Cond. Shangrilla no bairro Shangrilla, Goianá, MG';
  const endereco = 'Rua Doná Zéca, Shangrilla, Goianá, MG, 36152-000';
  const localizacaoComEndereco = `${localizacao} - ${endereco}`;

  assert.equal(adicionarEnderecoNaLocalizacao(localizacao, endereco), localizacaoComEndereco);
  assert.equal(adicionarEnderecoNaLocalizacao(localizacaoComEndereco, endereco), localizacaoComEndereco);
  assert.equal(adicionarEnderecoNaLocalizacao(localizacao, ''), localizacao);
});