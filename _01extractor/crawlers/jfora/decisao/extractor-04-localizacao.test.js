import assert from 'node:assert/strict';
import test from 'node:test';
import { adicionarEnderecoNaLocalizacao, extractEnderecoFromHtml } from './extractor-04-localizacao.js';

const endereco = 'Rua Justino Gomes Monteiro, 380';
const localizacao = 'Centro, Juiz de Fora, MG';

test('extrai o endereço do detalhe interno', () => {
  const html = '<p>Endereço:<b> Rua Justino Gomes Monteiro, 380</b></p>';
  assert.equal(extractEnderecoFromHtml(html), endereco);
});

test('extrai endereço sem rua no detalhe interno', () => {
  const html = '<p>Endereço:<b> Granjeamento Recanto da Cachoeira</b></p>';
  assert.equal(extractEnderecoFromHtml(html), 'Granjeamento Recanto da Cachoeira');
});

test('anexa o endereço ao final sem apagar nem duplicar a localização', () => {
  const resultado = `${localizacao} - ${endereco}`;
  assert.equal(adicionarEnderecoNaLocalizacao(localizacao, endereco), resultado);
  assert.equal(adicionarEnderecoNaLocalizacao(resultado, endereco), resultado);
});