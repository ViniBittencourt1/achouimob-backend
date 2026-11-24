import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { coletarCardsKantto } from './paginacao-vendas.js';

const base = 'https://www.kanttoimoveis.com.br/venda?transacao=%22venda%22';

function fixture({ stalled = false, status = 200, virtual = false } = {}) {
  let visible = 8;
  let scrolls = 0;
  let closed = false;
  let currentPage = 0;
  const visits = [];
  const page = {
    setUserAgent: async () => {}, goto: async (url, options) => {
      assert.equal(options.waitUntil, 'domcontentloaded');
      assert.equal(options.timeout, 45000);
      const publicPage = Number(new URL(url).searchParams.get('pagina') || 1);
      currentPage = publicPage - 1;
      visible = Math.min(8, 671 - currentPage * 32);
      visits.push(publicPage);
      return { ok: () => status === 200, status: () => status };
    }, url: () => base,
    close: async () => { closed = true; },
    waitForFunction: async (_callback, _options, previous) => { if (previous !== undefined && stalled) throw new Error('Timeout sem progresso'); },
    evaluate: async callback => {
      if (callback.name !== 'readSnapshotKantto') { scrolls++; if (!stalled) visible = Math.min(32, 671 - currentPage * 32, visible + 8); return; }
      const first = virtual ? Math.max(0, visible - 32) : 0;
      const html = Array.from({ length: visible - first }, (_, index) => `<div class="_card_fixture_1"><a href="/imovel/${currentPage * 32 + first + index + 1}"><img src="https://example.com/foto.jpg">AP${currentPage * 32 + first + index + 1}</a></div>`).join('');
      const dom = new JSDOM(`<span class="list-search-header_numberOfResults__test">671 resultados</span>${html}`, { url: base });
      const previous = globalThis.document;
      globalThis.document = dom.window.document;
      try { return callback(); }
      finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; dom.window.close(); }
    },
  };
  return { browser: { newPage: async () => page }, visits, scrolls: () => scrolls, closed: () => closed };
}

test('Kantto carrega 671 anuncios em 21 paginas publicas e 63 rolagens internas sem repetir a primeira', async () => {
  const state = fixture();
  const cards = await coletarCardsKantto(state.browser, { totalEsperado: 671 });
  assert.equal(cards.length, 671);
  assert.equal(new Set(cards.map(card => card.linkReal)).size, 671);
  assert.equal(state.scrolls(), 63);
  assert.deepEqual(state.visits, Array.from({ length: 21 }, (_, index) => index + 1));
  assert.equal(state.closed(), true);
});

test('Kantto preserva base quando nao ha progresso, HTTP falha ou total difere', async () => {
  for (const options of [{ stalled: true }, { status: 403 }]) {
    const state = fixture(options);
    await assert.rejects(coletarCardsKantto(state.browser, { totalEsperado: 671 }), /progresso|HTTP/);
    assert.equal(state.closed(), true);
  }
  await assert.rejects(coletarCardsKantto(fixture().browser, { totalEsperado: 672 }), /precontagem/);
});

test('Kantto acumula anuncios mesmo quando a janela de cards visiveis fica limitada a 32', async () => {
  const state = fixture({ virtual: true });
  const cards = await coletarCardsKantto(state.browser, { totalEsperado: 671 });
  assert.equal(cards.length, 671);
  assert.equal(new Set(cards.map(card => card.linkReal)).size, 671);
});