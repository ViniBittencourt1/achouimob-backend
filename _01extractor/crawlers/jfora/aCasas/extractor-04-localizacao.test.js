import assert from 'node:assert/strict';
import test from 'node:test';
import { adicionarEnderecoNaLocalizacao, extractEnderecoFromHtml } from './extractor-04-localizacao.js';

const endereco = 'Rua Professor Irineu José de Paula';
const localizacao = 'Previdenciários, Juiz de Fora, MG';

test('extrai o endereço do campo de localização interno', () => {
  const html = `<li class="matriz-localizacao-campo mb-2"><b>Endereço:</b> ${endereco}</li>`;
  assert.equal(extractEnderecoFromHtml(html), endereco);
});

test('anexa o endereço ao final da localização existente sem duplicar', () => {
  const resultado = `${localizacao} - ${endereco}`;
  assert.equal(adicionarEnderecoNaLocalizacao(localizacao, endereco), resultado);
  assert.equal(adicionarEnderecoNaLocalizacao(resultado, endereco), resultado);
});