import assert from 'node:assert/strict';
import test from 'node:test';
import { adicionarEnderecoNaLocalizacao, extractEnderecoFromHtml } from './extractor-04-localizacao.js';

const endereco = 'Rua Antônio Tristão, Bandeirantes, Juiz de Fora - MG';
const localizacao = 'Bandeirantes, Juiz de Fora, MG';

test('monta o endereço Schema.org completo da rota interna', () => {
  const html = `<span itemprop="address" itemscope itemtype="http://schema.org/PostalAddress">
    <strong itemprop="streetAddress">Rua Antônio Tristão</strong>
    <a><b itemprop="addressLocality">Bandeirantes</b></a>,
    <a><b itemprop="addressLocality">Juiz de Fora</b></a> -
    <b itemprop="addressRegion">MG</b>
  </span>`;
  assert.equal(extractEnderecoFromHtml(html), endereco);
});

test('anexa o endereço ao final sem apagar nem duplicar a localização', () => {
  const resultado = `${localizacao} - ${endereco}`;
  assert.equal(adicionarEnderecoNaLocalizacao(localizacao, endereco), resultado);
  assert.equal(adicionarEnderecoNaLocalizacao(resultado, endereco), resultado);
});