import assert from 'node:assert/strict';
import test from 'node:test';
import { adicionarEnderecoNaLocalizacao, extractEnderecoFromHtml } from './extractor-04-localizacao.js';

const endereco = 'Rua Antônio Fellet, 613 - Vale do Ipê - Juiz de Fora/MG';
const localizacao = 'Vale do Ipê, Juiz de Fora/MG';

test('extrai o endereço completo do detalhe do Acervo', () => {
  const html = `<address class="Info_colorOfAddressInfos__nDVGF mb-1" itemprop="address"><span>Rua Antônio Fellet, </span><span>613 - </span>Vale do Ipê - Juiz de Fora/MG</address>`;
  assert.equal(extractEnderecoFromHtml(html), endereco);
});

test('anexa o endereço ao final sem apagar nem duplicar a localização', () => {
  const resultado = `${localizacao} - ${endereco}`;
  assert.equal(adicionarEnderecoNaLocalizacao(localizacao, endereco), resultado);
  assert.equal(adicionarEnderecoNaLocalizacao(resultado, endereco), resultado);
});