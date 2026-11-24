import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { extractLocalData, parseMouraCard } from './extractor.js';

const base = 'https://www.mouraimoveisjf.com.br/imoveis/a-venda';
function card(code = 'AP5550-MOUY') {
  return `<a class="card-with-buttons borderHover" href="/imovel/apartamento/${code}">
    <p class="card-with-buttons__code">${code}</p>
    <p class="card-with-buttons__title">Apartamento</p>
    <h2 class="card-with-buttons__heading">Vale do Ip&#234; - Juiz de Fora - MG</h2>
    <ul><li>75,38 m&#178;</li><li>2 Quartos</li><li>1 Su&#237;te</li><li>2 Banheiros</li><li>2 Vagas</li></ul>
    <p class="card-with-buttons__value">R$ 519.000,50</p>
    <img class="cards_digital_carousel-image" src="https://example.com/foto.jpg"></a>`;
}

function fixture({ missingNext = false, status = 200, secondTotal = 2, emptyCards = false } = {}) {
  let current;
  let closed = false;
  const visits = [];
  return {
    visits,
    get closed() { return closed; },
    newPage: async () => ({
      setUserAgent: async () => {}, setViewport: async () => {}, waitForFunction: async () => {},
      goto: async url => { current = url; visits.push(url); return { status: () => status }; },
      url: () => current,
      evaluate: async callback => {
        const pagina = Number(new URL(current).searchParams.get('pagina') || 1);
        const dom = new JSDOM(`<h1>Exibindo ${pagina === 1 ? 2 : secondTotal} Imoveis a venda</h1>
          ${emptyCards ? '' : card(`AP${pagina}`)}
          ${pagina === 1 && !missingNext ? `<a class="btn-next" href="${base}?pagina=2">Ver mais</a>` : ''}`, { url: current });
        const previous = globalThis.document;
        globalThis.document = dom.window.document;
        try { return callback(); } finally {
          if (previous === undefined) delete globalThis.document;
          else globalThis.document = previous;
          dom.window.close();
        }
      },
      close: async () => { closed = true; },
    }),
  };
}

test('Moura le os 20 campos do card atual com decimais, metricas, foto e catalogos', () => {
  const item = parseMouraCard(card());
  assert.equal(Object.keys(item).length, 20);
  assert.equal(item.preco, 519000.5);
  assert.equal(item.areaValor, 75.38);
  assert.equal(item.tipoImovel, 'apartamento');
  assert.equal(item.cidade, 'juiz-de-fora-mg');
  assert.equal(item.bairro, 'vale-do-ipe');
  assert.equal(item.codigoBase, 'AP5550-MOUY');
  assert.equal(item.dormitorioValor, 2);
  assert.equal(item.banheiroValor, 2);
  assert.equal(item.garagemValor, 2);
  assert.equal(item.linkFoto, 'https://example.com/foto.jpg');
  assert.equal(item.corretor, 'Moura Corretora De Imoveis');
  for (const html of [card().replace('R$ 519.000,50', 'Consulte'), card().replace('AP5550-MOUY</p>', '</p>')]) {
    assert.throws(() => parseMouraCard(html), /Card sem/);
  }
});

test('Moura segue links oficiais de paginas e exige coleta completa', async () => {
  const browser = fixture();
  const result = await extractLocalData(browser, [base], { totalEsperado: 2 });
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(item => item.codigoBase), ['AP1', 'AP2']);
  assert.equal(browser.visits.length, 2);
  assert.ok(browser.visits[1].includes('pagina=2'));
  assert.ok(browser.closed);
});

test('Moura formata atualizadoEm em dd/MM/yyyy HH:mm:ss no fuso de Sao Paulo', () => {
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-20T22:19:29Z').getTime() });
  try {
    const item = parseMouraCard(card());
    assert.equal(item.atualizadoEm, '20/10/2026 19:19:29');
    assert.equal(item.dataInclusao, '2026-10-20T22:19:29.000Z');
  } finally { mock.timers.reset(); }
});

test('Moura nao retorna vazio ou parcial em HTTP 403, paginacao ausente ou total alterado', async () => {
  for (const options of [{ status: 403 }, { missingNext: true }, { secondTotal: 3 }, { emptyCards: true }]) {
    const browser = fixture(options);
    await assert.rejects(extractLocalData(browser, [base], { totalEsperado: 2, retryDelayMs: 0 }));
    assert.ok(browser.closed);
  }
});
