import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { coletarPaginasInvestVendas, validarPaginaInvestVendas } from './paginacao-vendas.js';
import { extractInvestData } from './extractor.js';

const base = 'https://www.invest.com.br/ResultadoBusca.aspx?fin=1';

function fixture({ missing = false, status = 200 } = {}) {
  let current = base;
  const visits = [];
  const page = {
    goto: async url => { current = url; visits.push(url); return { ok: () => status === 200, status: () => status }; }, url: () => current,
    waitForSelector: async () => {},
    evaluate: async (callback, nextPage) => {
      const number = Number(new URL(current).searchParams.get('pag') || 1);
      const count = Math.min(135, 1434 - (number - 1) * 135);
      const cards = Array.from({ length: count }, (_, index) => `<div class="property-box"><a href="/Imovel.aspx?id=${(number - 1) * 135 + index + 1}">Imovel</a></div>`).join('');
      const next = missing || number === 11 ? '' : `<a href="${base}&pag=${nextPage}&qtdeitens=${nextPage === 11 ? 84 : 135}&posicao=${number * 135}">Proxima</a>`;
      const dom = new JSDOM(`<span id="ContentPlaceHolder1_lblQuantidadeImoveisEncontrados"><h1>Vendas - 1434 Imóveis encontrados</h1></span>${cards}${next}`, { url: current });
      const previous = globalThis.document;
      globalThis.document = dom.window.document;
      try { return callback(nextPage); }
      finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; dom.window.close(); }
    },
  };
  return { page, visits };
}

test('Invest segue URLs oficiais e coleta1434 em11paginas, ultima com84itens', async () => {
  const state = fixture();
  const cards = await coletarPaginasInvestVendas(state.page, { totalEsperado: 1434 });
  assert.equal(cards.length, 1434);
  assert.equal(state.visits.length, 11);
  assert.equal(new URL(state.visits.at(-1)).searchParams.get('qtdeitens'), '84');
  assert.equal(new URL(state.visits.at(-1)).searchParams.get('posicao'), '1350');
});

test('Invest rejeita pagina ausente, HTTP invalido e origem aluguel em vez de salvar parcial', async () => {
  for (const options of [{ missing: true }, { status: 503 }]) await assert.rejects(coletarPaginasInvestVendas(fixture(options).page, { totalEsperado: 1434 }), /incompleta|parcial/);
  assert.throws(() => validarPaginaInvestVendas(`${base.replace('fin=1', 'fin=2')}&pag=2`, 2), /fora de vendas/);
});

test('extrator Invest fecha pagina e nao grava JSON ou skip quando vendas falham', async () => {
  const writes = [];
  const writer = mock.method(fs, 'writeFileSync', (...args) => writes.push(args));
  let closed = false;
  const page = { goto: async () => ({ ok: () => false, status: () => 503 }), close: async () => { closed = true; } };
  try {
    await assert.rejects(extractInvestData({ newPage: async () => page }, { totalEsperado: 1434 }), /HTTP/);
    assert.equal(closed, true);
    assert.deepEqual(writes, []);
  } finally { writer.mock.restore(); }
});