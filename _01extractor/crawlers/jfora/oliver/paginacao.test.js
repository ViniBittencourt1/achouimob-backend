import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { extractLocalData } from './extractor.js';

const base = 'https://www.oliverimoveisjf.com.br/imoveis/a-venda';

function fixture({ total = 63, missingNext = false, duplicate = false, status = 200 } = {}) {
  let current = base;
  let closed = false;
  const visits = [];
  const page = {
    setUserAgent: async () => {},
    setViewport: async () => {},
    goto: async url => {
      current = url;
      visits.push(url);
      return { status: () => status };
    },
    url: () => current,
    close: async () => { closed = true; },
    evaluate: async callback => {
      const number = Number(new URL(current).searchParams.get('pagina') || 1);
      const start = (number - 1) * 12;
      const cards = Array.from({ length: Math.min(12, total - start) }, (_, index) => {
        const code = duplicate && number > 1 ? index + 1 : start + index + 1;
        return `<a class="card-with-buttons borderHover" href="/imovel/apartamento-${code}/AP${code}-OLJW?from=sale">
          <div class="cards_digital_carousel-container"><ul class="cards_digital_carousel">
            <li><img class="cards_digital_carousel-image" src="https://example.com/foto-${code}.jpg"></li>
            <li><img class="cards_digital_carousel-image" src="https://example.com/outra-${code}.jpg"></li>
          </ul></div>
          <p class="card-with-buttons__code">AP${code}-OLJW</p>
          <p class="card-with-buttons__title">Apartamento</p>
          <h2 class="card-with-buttons__heading">Bandeirantes - Juiz de Fora - MG</h2>
          <ul><li>75,5 m²</li><li>2 Quartos</li><li>1 Banheiro</li><li>3 Vagas</li></ul>
          <p class="card-with-buttons__value-title">Venda</p>
          <p class="card-with-buttons__value">R$ 200.000</p>
        </a>`;
      }).join('');
      const next = missingNext || start + 12 >= total ? '' : `<a class="btn-next" href="${base}?pagina=${number + 1}">Ver mais</a>`;
      const dom = new JSDOM(`<h1>Exibindo ${total} Imóveis à venda</h1>${cards}${next}`, { url: current });
      const previous = globalThis.document;
      globalThis.document = dom.window.document;
      try { return callback(); }
      finally {
        if (previous === undefined) delete globalThis.document;
        else globalThis.document = previous;
        dom.window.close();
      }
    },
  };
  page.waitForFunction = async (callback, _options, ...args) => {
    assert.ok(await page.evaluate(() => callback(...args)), 'DOM deve satisfazer a espera pelos cards');
  };
  return { browser: { newPage: async () => page }, visits, closed: () => closed };
}

test('Oliver coleta 63 cards modernos em seis paginas com os 20 campos preservados', async () => {
  const state = fixture();
  const imoveis = await extractLocalData(state.browser, [base], { totalEsperado: 63 });
  assert.equal(imoveis.length, 63);
  assert.equal(new Set(imoveis.map(imovel => imovel.linkReal)).size, 63);
  assert.equal(state.visits.length, 6);
  assert.ok(state.visits.every(url => new URL(url).searchParams.get('ordenar') === 'recentes'));
  assert.equal(state.closed(), true);
  const first = imoveis[0];
  assert.equal(Object.keys(first).length, 20);
  assert.equal(first.titulo, 'Apartamento em Juiz de Fora');
  assert.equal(first.tipoImovel, 'apartamento');
  assert.equal(first.cidade, 'juiz-de-fora-mg');
  assert.equal(first.bairro, 'bandeirantes');
  assert.equal(first.localizacao, 'Bandeirantes - Juiz de Fora');
  assert.equal(first.preco, 200000);
  assert.equal(first.codigoBase, 'AP1-OLJW');
  assert.equal(first.linkFoto, 'https://example.com/foto-1.jpg');
  assert.equal(first.areaValor, 75.5);
  assert.equal(first.dormitorioValor, 2);
  assert.equal(first.banheiroValor, 1);
  assert.equal(first.garagemValor, 3);
});

test('Oliver rejeita paginas ausentes, repetidas, HTTP invalido e total divergente', async () => {
  for (const options of [
    { missingNext: true },
    { duplicate: true },
    { status: 403 },
    { total: 12 },
  ]) {
    const state = fixture(options);
    await assert.rejects(extractLocalData(state.browser, [base], {
      totalEsperado: 63, maxTentativasPagina: 1,
    }), /incompleta|parcial|precontagem/);
    assert.equal(state.closed(), true);
  }
});
