import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectUniversalLocacaoCards, extractUniversalData } from './extractor.js';

const url = 'https://universalimoveis.com.br/imoveis?negociacao=locacao&order=recentes&preco_min=&preco_max=';
const card = code => `<div class="imovel-item"><a href="/imovel/apartamento--locacao--cod-${code}">Apartamento</a></div>`;

function fixture({ repeated = false, status = 200, redirected = false, missing = false } = {}) {
  const requests = [];
  return {
    requests,
    page: {
      url: () => url,
      content: async () => `<span id="title--label">Imoveis (3)</span>${card(1)}${card(2)}`,
      evaluate: async (_callback, destination) => {
        requests.push(new URL(destination));
        return { status, url: redirected ? 'https://universalimoveis.com.br/imoveis?negociacao=venda' : destination, html: missing ? '' : repeated ? card(1) + card(2) : card(2) + card(3) };
      },
      $: async () => assert.fail('Nao depender do botao da pagina'),
    },
  };
}

test('Universal recebe HTML paginado sem clicar e mantem filtros de locacao', async () => {
  const state = fixture();
  const cards = await collectUniversalLocacaoCards(state.page, url);
  assert.equal(cards.length, 3);
  assert.equal(state.requests.length, 1);
  assert.equal(state.requests[0].searchParams.get('page'), '2');
  assert.equal(state.requests[0].searchParams.get('tmpl'), 'imoveis/list_items');
  assert.equal(state.requests[0].searchParams.get('negociacao'), 'locacao');
  assert.equal(state.requests[0].searchParams.get('order'), 'recentes');
});

test('Universal rejeita resposta repetida ou vazia antes do total completo', async () => {
  for (const options of [{ repeated: true }, { missing: true }]) {
    const state = fixture(options);
    await assert.rejects(collectUniversalLocacaoCards(state.page, url), /incompleta ou sem progresso/);
  }
});

test('Universal rejeita HTTP invalido e redirecionamento para vendas', async () => {
  for (const options of [{ status: 503 }, { redirected: true }]) {
    const state = fixture(options);
    await assert.rejects(collectUniversalLocacaoCards(state.page, url), /HTTP 503|redirecionada/);
  }
});

test('Universal nao aceita links externos nem quantidade acima do total', async () => {
  for (const html of ['<span id="title--label">(1)</span><div class="imovel-item"><a href="https://example.com/imovel/1">Casa</a></div>', `<span id="title--label">(1)</span>${card(1)}${card(2)}`]) {
    await assert.rejects(collectUniversalLocacaoCards({ url: () => url, content: async () => html }, url), /fora da busca|incompleta/);
  }
});

test('vendas Universal preservam o fluxo anterior de clique', async () => {
  let closed = false;
  const page = {
    setUserAgent: async () => {}, setViewport: async () => {}, goto: async () => {},
    waitForSelector: async () => { throw new Error('Sem LGPD'); },
    $: async () => ({ click: async () => { throw new Error('Node is detached from document'); } }),
    close: async () => { closed = true; },
  };
  await assert.rejects(extractUniversalData({ newPage: async () => page }, [url.replace('locacao', 'venda')]), /Node is detached/);
  assert.equal(closed, true);
});