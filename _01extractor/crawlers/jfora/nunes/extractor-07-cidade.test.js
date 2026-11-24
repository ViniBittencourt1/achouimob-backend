import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractCidadeFromCardHtml } from './extractor-07-cidade.js';

const empreendimento = 'https://www.nunesimoveisjf.com.br/empreendimento/flow-studios-juiz-de-fora-27-m/24871920-NUNO?from=sale';

test('cidade Nunes é resolvida pelo slug da URL de empreendimento quando o card não informa cidade', () => {
  assert.equal(extractCidadeFromCardHtml('<a></a>', empreendimento), 'juiz-de-fora-mg');
});

test('cidade válida do heading continua tendo prioridade sobre o linkReal', () => {
  const html = '<h2 class="card-with-buttons__heading">Centro - Juiz de Fora - MG</h2>';
  assert.equal(extractCidadeFromCardHtml(html, 'https://www.nunesimoveisjf.com.br/empreendimento/outra-cidade/123'), 'juiz-de-fora-mg');
});

test('cidade desconhecida retorna vazia quando não existe fallback validado na URL', () => {
  assert.equal(extractCidadeFromCardHtml('', 'https://www.nunesimoveisjf.com.br/empreendimento/flow-studios/123'), '');
});

test('cidade explícita da URL prevalece sobre o nome de empreendimento homônimo', () => {
  const heading = '<h2 class="card-with-buttons__heading">Unique Monte Castelo - Apartamentos com 2 quartos</h2>';
  const link = 'https://www.nunesimoveisjf.com.br/empreendimento/unique-monte-castelo-apartamentos-juiz-de-fora-2-quartos-36-m/24615185-NUNO?from=sale';
  assert.equal(extractCidadeFromCardHtml(heading, link), 'juiz-de-fora-mg');
});