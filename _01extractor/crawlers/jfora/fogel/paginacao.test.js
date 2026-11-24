import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { coletarCardsFogelVendas, readSnapshotFogelVendas } from './paginacao-vendas.js';

const base = 'https://fogel.com.br/pesquisa?transacao=Venda';

function fixture({ total = 135, perPage = 24, missing = false, status = 200 } = {}) {
  let index = 0;
  let closed = false;
  let clicks = 0;
  const page = {
    setUserAgent: async () => {}, setExtraHTTPHeaders: async () => {}, waitForFunction: async () => {},
    goto: async () => ({ ok: () => status === 200, status: () => status }), url: () => base,
    click: async selector => { assert.equal(selector, '#searchResultsPagination button[data-page-nav="next"]'); index++; clicks++; },
    close: async () => { closed = true; },
    evaluate: async callback => {
      const start = index * perPage;
      const cards = Array.from({ length: Math.min(perPage, total - start) }, (_, offset) => `<div class="feat_property search-feat-card"><a href="/detalhes/${start + offset + 1}.html"><img src="https://example.com/foto.jpg"></a></div>`).join('');
      const enabled = !missing && start + perPage < total;
      const dom = new JSDOM(`<span class="heading-color fw600">Página ${index + 1} de ${Math.ceil(total / perPage)} · ${start + 1}–${Math.min(start + perPage, total)} de ${total} resultados</span>${cards}<nav id="searchResultsPagination"><button data-page="${index}" class="is-active">${index + 1}</button><button data-page-nav="next" ${enabled ? '' : 'disabled'}>Proxima</button></nav>`, { url: base });
      const previous = globalThis.document;
      globalThis.document = dom.window.document;
      try { return callback(); }
      finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; dom.window.close(); }
    },
  };
  return { browser: { newPage: async () => page }, clicks: () => clicks, closed: () => closed };
}

test('Fogel segue botoes JavaScript e coleta 135 anuncios em seis paginas', async () => {
  const state = fixture();
  const cards = await coletarCardsFogelVendas(state.browser, { totalEsperado: 135 });
  assert.equal(cards.length, 135);
  assert.equal(new Set(cards.map(card => card.linkReal)).size, 135);
  assert.equal(state.clicks(), 5);
  assert.equal(state.closed(), true);
});

test('nao assume 24 cards por pagina e nao publica pagina parcial ou HTTP invalido', async () => {
  const small = fixture({ perPage: 12 });
  assert.equal((await coletarCardsFogelVendas(small.browser, { totalEsperado: 135 })).length, 135);
  for (const options of [{ missing: true }, { status: 403 }]) {
    const state = fixture(options);
    await assert.rejects(coletarCardsFogelVendas(state.browser, { totalEsperado: 135 }), /incompleta|HTTP/);
    assert.equal(state.closed(), true);
  }
  await assert.rejects(coletarCardsFogelVendas(fixture().browser, { url: base.replace('Venda', 'Locacao') }), /venda obrigatoria/);
});