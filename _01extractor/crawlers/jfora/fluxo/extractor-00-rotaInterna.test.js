import assert from 'node:assert/strict';
import { test } from 'node:test';
import { enrichImoveisWithInternalData } from './extractor-00-rotaInterna.js';
import { USER_AGENT_FLUXO } from './config.js';

test('detalhes usam user-agent e DOM pronto sem esperar networkidle0', async () => {
  let closed = false;
  let identified = false;
  const item = { linkReal: 'https://www.fluxoimoveis.com/imovel/1/casa', areaValor: 75, localizacao: 'Centro' };
  const page = {
    setUserAgent: async value => { assert.equal(value, USER_AGENT_FLUXO); identified = true; },
    goto: async (_url, options) => {
      assert.equal(identified, true);
      assert.equal(options.waitUntil, 'domcontentloaded');
      return { ok: () => true };
    },
    waitForSelector: async selector => assert.equal(selector, '#desc_tags, section.imovel-info-interna'),
    content: async () => '<div id="desc_tags"><p>Endere\u00e7o: Rua A, 10</p><p>Area util: 90</p></div>',
    close: async () => { closed = true; },
  };
  await enrichImoveisWithInternalData({ newPage: async () => page }, [item]);
  assert.equal(item.areaValor, 90);
  assert.equal(item.localizacao, 'Centro - Rua A, 10');
  assert.equal(closed, true);
});

for (const mode of ['timeout', '403', 'sem-area']) {
  test(`detalhes ${mode} preservam area da listagem`, async context => {
    const log = context.mock.method(console, 'error', () => {});
    let closed = false;
    const item = { linkReal: 'https://www.fluxoimoveis.com/imovel/1/casa', areaValor: 75, linkCard: 'anterior' };
    const page = {
      setUserAgent: async () => {},
      goto: async () => {
        if (mode === 'timeout') throw new Error('Navigation timeout');
        return { ok: () => mode !== '403', status: () => 403 };
      },
      waitForSelector: async () => {},
      content: async () => '<div id="desc_tags"></div>',
      close: async () => { closed = true; },
    };
    await enrichImoveisWithInternalData({ newPage: async () => page }, [item]);
    assert.equal(item.areaValor, 75);
    assert.equal(closed, true);
    if (mode !== 'sem-area') {
      assert.equal(item.linkCard, 'anterior');
      assert.equal(log.mock.calls.length, 1);
      assert.match(log.mock.calls[0].arguments[0], /Dados da listagem preservados/);
    }
  });
}
