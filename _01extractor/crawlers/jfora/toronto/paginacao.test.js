import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { coletarPaginasKenloVendas, readSnapshotToronto } from '../_utils/vendasKenloPaginacao.js';

const base = 'https://www.torontoimoveis.com/imoveis/a-venda';

function fixture({
  missing = false,
  status = 200,
  expectedWaitUntil = 'networkidle2',
  expectedTimeout = 90000,
} = {}) {
  let current = base;
  let closed = false;
  const visits = [];
  const page = {
    setUserAgent: async () => {}, setViewport: async () => {}, waitForFunction: async () => {},
    goto: async (url, options) => {
      assert.equal(options.waitUntil, expectedWaitUntil);
      assert.equal(options.timeout, expectedTimeout);
      current = url;
      visits.push(url);
      return { status: () => status };
    }, url: () => current,
    close: async () => { closed = true; },
    evaluate: async callback => {
      const number = Number(new URL(current).searchParams.get('pagina') || 1);
      const start = (number - 1) * 12;
      const cards = Array.from({ length: Math.min(12, 821 - start) }, (_, index) => {
        const code = start + index + 1;
        return `<a class="card_split_vertically borderHover" href="/imovel/${code}?from=sale"><p class="card_split_vertically__type">Apartamento</p><h2 class="card_split_vertically__location">Centro - Juiz de Fora - MG</h2><p class="card_split_vertically__code">${code}</p><p class="card_split_vertically__value">R$ 300.000</p><img src="https://example.com/foto.jpg"></a>`;
      }).join('');
      const next = missing || start + 12 >= 821 ? '' : `<a class="btn-next" href="${base}?pagina=${number + 1}">Ver mais</a>`;
      const dom = new JSDOM(`<h1>Exibindo 821 Imóveis à venda</h1>${cards}${next}<button class="btn-next" data-action="next">Proximo</button>`, { url: current });
      const previous = globalThis.document;
      globalThis.document = dom.window.document;
      try { return callback(); }
      finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; dom.window.close(); }
    },
  };
  return { browser: { newPage: async () => page }, visits, closed: () => closed };
}

test('Toronto coleta 821 cards split em 69 paginas sem usar carrossel ou faixas de preco', async () => {
  const state = fixture({ expectedWaitUntil: 'domcontentloaded', expectedTimeout: 45000 });
  const cards = await coletarPaginasKenloVendas(state.browser, [base], {
    projeto: 'jfToronto',
    readSnapshot: readSnapshotToronto,
    cardSelector: 'a.card_split_vertically.borderHover',
    totalEsperado: 821,
    waitUntil: 'domcontentloaded',
    navigationTimeoutMs: 45000,
  });
  assert.equal(cards.length, 821);
  assert.equal(state.visits.length, 69);
  assert.ok(state.visits.every(url => new URL(url).searchParams.get('ordenar') === 'recentes' && !new URL(url).searchParams.has('preco-de-venda')));
  assert.ok(cards[0].includes('card_split_vertically__code'));
  assert.ok(cards[0].includes('https://example.com/foto.jpg'));
  assert.equal(state.closed(), true);
});

test('Toronto rejeita falta de pagina e HTTP invalido sem devolver lista parcial', async () => {
  for (const options of [{ missing: true }, { status: 503 }]) {
    const state = fixture(options);
    await assert.rejects(coletarPaginasKenloVendas(state.browser, [base], { projeto: 'jfToronto', readSnapshot: readSnapshotToronto, cardSelector: 'a.card_split_vertically.borderHover', totalEsperado: 821, maxTentativasPagina: 1 }), /incompleta|parcial/);
    assert.equal(state.closed(), true);
  }
});