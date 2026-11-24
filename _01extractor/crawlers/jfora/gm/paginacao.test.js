import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { coletarPaginasKenloVendas, readSnapshotGm } from '../_utils/vendasKenloPaginacao.js';
import { extractTitulo as extractTituloNunes } from '../nunes/extractor-02-titulo.js';

const base = 'https://www.crispiimoveis.com.br/imoveis/a-venda';

test('Kenlo preserva tilde literal da faixa na navegacao inicial, paginacao e ordenacao alternativa', async () => {
  const visits = [];
  let current;
  const browser = { newPage: async () => ({
    setUserAgent: async () => {}, setViewport: async () => {}, waitForFunction: async () => {},
    goto: async url => {
      assert.ok(url.includes('preco-de-venda=0~500000'), url);
      assert.ok(!/%7e/i.test(url), url);
      current = url;
      visits.push(url);
      return { status: () => 200 };
    },
    url: () => current,
    evaluate: async () => {
      const url = new URL(current);
      const pagina = Number(url.searchParams.get('pagina') || 1);
      const alternativa = url.searchParams.get('ordenar') === 'maior-valor';
      const id = alternativa ? 3 : pagina;
      url.searchParams.set('pagina', '2');
      return {
        heading: '3 Imoveis a venda',
        cards: [{ href: `https://example.com/imovel/${id}`, html: `card-${id}` }],
        next: !alternativa && pagina === 1 ? url.href : '',
      };
    },
    close: async () => {},
  }) };
  const cards = await coletarPaginasKenloVendas(browser, [
    'https://www.amimimoveis.com.br/imoveis/a-venda?preco-de-venda=0%7E500000',
  ], {
    projeto: 'nitAmin', readSnapshot: () => {}, cardSelector: 'a',
    totalEsperado: 3, allowPartialRoutes: true, ordenacoesAlternativas: ['maior-valor'],
  });
  assert.deepEqual(cards, ['card-1', 'card-2', 'card-3']);
  assert.equal(visits.length, 3);
});

test('Nunes usa heading do empreendimento quando tipo esta vazio sem mudar titulos preenchidos', () => {
  assert.equal(extractTituloNunes('<p class="card-with-buttons__title"></p><h2 class="card-with-buttons__heading">Mirante Granbery</h2>'), 'Mirante Granbery');
  assert.equal(extractTituloNunes('<p class="card-with-buttons__title">Apartamento</p><h2 class="card-with-buttons__heading">Centro - Juiz de Fora</h2>'), 'Apartamento');
});

function fixture({ missing = false, status = 200, statuses, total = 37, url = base, collection = 'jfCrispi', emptyPages = [], reportedTotals = {}, transientTotals = {}, expectedWaitUntil = 'networkidle2', expectedTimeout = 90000 } = {}) {
  let current = url;
  const pageVisits = {};
  let closed = false;
  const visits = [];
  const page = {
    setUserAgent: async () => {}, setViewport: async () => {}, waitForFunction: async () => {},
    goto: async (url, options) => {
      assert.equal(options.waitUntil, expectedWaitUntil);
      assert.equal(options.timeout, expectedTimeout);
      current = url;
      visits.push(url);
      const currentStatus = statuses?.[visits.length - 1] ?? status;
      return { status: () => currentStatus };
    }, url: () => current,
    close: async () => { closed = true; },
    evaluate: async callback => {
      const number = Number(new URL(current).searchParams.get('pagina') || 1);
      const empty = emptyPages.includes(number);
      const emptyBeforeOrCurrent = emptyPages.filter(pageNumber => pageNumber <= number).length;
      const start = (number - 1 - emptyBeforeOrCurrent) * 12;
      const cards = empty ? '' : Array.from({ length: Math.min(12, total - start) }, (_, index) => {
        const code = start + index + 1;
        const path = collection === 'jfNunes' && code > 350 ? 'empreendimento' : 'imovel';
        return `<a class="card-with-buttons borderHover" href="/${path}/${code}?from=sale"><p class="card-with-buttons__code">${code}</p><p class="card-with-buttons__title">Apartamento</p><h2 class="card-with-buttons__heading">Centro - Juiz de Fora</h2><p class="card-with-buttons__value">R$ 300.000</p><ul><li>2 quartos</li></ul><img class="cards_digital_carousel-image" src="https://example.com/foto.jpg"></a>`;
      }).join('');
      const lastPage = Math.ceil(total / 12) + emptyPages.length;
      const next = missing || number >= lastPage ? '' : `<a class="btn-next" href="${url}?pagina=${number + 1}">Ver mais</a>`;
      const visitIndex = pageVisits[number] = (pageVisits[number] ?? -1) + 1;
      const shownTotal = transientTotals[number]?.[visitIndex] ?? reportedTotals[number] ?? total;
      const dom = new JSDOM(`<h1>Exibindo ${shownTotal} Imóveis à venda</h1>${cards}${next}`, { url: current });
      const previous = globalThis.document;
      globalThis.document = dom.window.document;
      try { return callback(); }
      finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; dom.window.close(); }
    },
  };
  return { browser: { newPage: async () => page }, visits, closed: () => closed };
}

test('Masson aguarda DOM e conteudo necessario sem esperar networkidle2', async () => {
  const state = fixture({
    total: 1,
    collection: 'jfMasson',
    url: 'https://www.massonimoveis.com.br/imoveis/a-venda',
    expectedWaitUntil: 'domcontentloaded',
    expectedTimeout: 45000,
  });
  const cards = await coletarPaginasKenloVendas(state.browser, [
    'https://www.massonimoveis.com.br/imoveis/a-venda',
  ], {
    projeto: 'jfMasson',
    readSnapshot: readSnapshotGm,
    cardSelector: 'a.card-with-buttons.borderHover',
    totalEsperado: 1,
    waitUntil: 'domcontentloaded',
    navigationTimeoutMs: 45000,
  });
  assert.equal(cards.length, 1);
  assert.equal(state.visits.length, 1);
});

test('mudanca do contador identifica o erro e a pagina sem retornar coleta parcial', async () => {
  const state = fixture({ total: 24, reportedTotals: { 2: 25 } });
  await assert.rejects(coletarPaginasKenloVendas(state.browser, [base], {
    projeto: 'jfCrispi', readSnapshot: readSnapshotGm,
    cardSelector: 'a.card-with-buttons.borderHover', totalEsperado: 24,
  }), error => {
    assert.equal(error.code, 'KENLO_TOTAL_ALTERADO');
    assert.match(error.message, /24 -> 25/);
    assert.match(error.message, /pagina=2/);
    return true;
  });
  assert.equal(state.closed(), true);
});

test('Kenlo permite a ordem padrao sem propagar ordenar da URL inicial', async () => {
  const url = `${base}?ordenar=recentes`;
  const state = fixture({ total: 25 });
  const cards = await coletarPaginasKenloVendas(state.browser, [url], {
    projeto: 'jfCrispi', readSnapshot: readSnapshotGm, cardSelector: 'a.card-with-buttons.borderHover',
    totalEsperado: 25, ordenacaoInicial: null,
  });
  assert.equal(cards.length, 25);
  assert.equal(state.visits.length, 3);
  assert.ok(state.visits.every(url => !new URL(url).searchParams.has('ordenar')));
});

test('contador divergente transitorio recarrega a mesma pagina e conclui sem perder cards', async () => {
  const state = fixture({ total: 36, transientTotals: { 2: [0, 13] } });
  const cards = await coletarPaginasKenloVendas(state.browser, [base], {
    projeto: 'jfCrispi', readSnapshot: readSnapshotGm, retryDelayMs: 0,
    cardSelector: 'a.card-with-buttons.borderHover', totalEsperado: 36, recargasTotalDivergente: 3,
  });
  assert.equal(cards.length, 36);
  assert.equal(new Set(cards).size, 36);
  assert.equal(state.visits.filter(url => url.includes('pagina=2')).length, 3);
});

test('contador divergente persistente apos recargas ainda falha', async () => {
  const state = fixture({ total: 24, reportedTotals: { 2: 0 } });
  await assert.rejects(coletarPaginasKenloVendas(state.browser, [base], {
    projeto: 'jfCrispi', readSnapshot: readSnapshotGm, retryDelayMs: 0,
    cardSelector: 'a.card-with-buttons.borderHover', totalEsperado: 24, recargasTotalDivergente: 2,
  }), error => error.code === 'KENLO_TOTAL_ALTERADO' && /24 -> 0/.test(error.message));
  assert.equal(state.visits.filter(url => url.includes('pagina=2')).length, 3);
});

for (const project of [
  { collection: 'jfCrispi', total: 37, url: base },
  { collection: 'jfMasson', total: 686, url: 'https://www.massonimoveis.com.br/imoveis/a-venda' },
  { collection: 'jfEstrelaSul', total: 314, url: 'https://www.estrelasulimoveis.com.br/imoveis/a-venda' },
  { collection: 'jfNunes', total: 394, url: 'https://www.nunesimoveisjf.com.br/imoveis/a-venda' },
  { collection: 'jfSpeciale', total: 69, url: 'https://www.specialeimobiliaria.com.br/imoveis/a-venda' },
]) {
test(`${project.collection} coleta ${project.total} cards seguindo Ver mais como link`, async () => {
  const state = fixture(project);
  const cards = await coletarPaginasKenloVendas(state.browser, [project.url], { projeto: project.collection, readSnapshot: readSnapshotGm, cardSelector: 'a.card-with-buttons.borderHover', totalEsperado: project.total });
  assert.equal(cards.length, project.total);
  assert.equal(state.visits.length, Math.ceil(project.total / 12));
  assert.ok(state.visits.every(url => new URL(url).searchParams.get('ordenar') === 'recentes'));
  assert.ok(cards[0].includes('card-with-buttons__value'));
  assert.ok(cards[0].includes('https://example.com/foto.jpg'));
  if (project.collection === 'jfNunes') assert.equal(cards.filter(card => card.includes('href="/empreendimento/')).length, 44);
  assert.equal(state.closed(), true);
});
}

test('GM rejeita falta de pagina ou HTTP invalido e fecha navegador da listagem', async () => {
  for (const options of [{ missing: true }, { status: 503 }]) {
    const state = fixture(options);
    await assert.rejects(coletarPaginasKenloVendas(state.browser, [base], { projeto: 'jfCrispi', readSnapshot: readSnapshotGm, cardSelector: 'a.card-with-buttons.borderHover', totalEsperado: 37, maxTentativasPagina: 1 }), /incompleta|parcial/);
    assert.equal(state.closed(), true);
  }
});

test('GM repete somente a pagina que respondeu 502 e preserva o progresso', async () => {
  const state = fixture({ total: 24, statuses: [200, 502, 200] });
  const cards = await coletarPaginasKenloVendas(state.browser, [base], {
    projeto: 'jfCrispi',
    readSnapshot: readSnapshotGm,
    cardSelector: 'a.card-with-buttons.borderHover',
    totalEsperado: 24,
    retryDelayMs: 0,
  });
  assert.equal(cards.length, 24);
  assert.equal(state.visits.length, 3);
  assert.equal(new URL(state.visits[1]).searchParams.get('pagina'), '2');
  assert.equal(state.visits[1], state.visits[2]);
  assert.equal(state.closed(), true);
});

test('GM atravessa pagina vazia isolada e preserva a validacao do total', async () => {
  const state = fixture({ total: 24, emptyPages: [2] });
  const cards = await coletarPaginasKenloVendas(state.browser, [base], {
    projeto: 'jfCrispi',
    readSnapshot: readSnapshotGm,
    cardSelector: 'a.card-with-buttons.borderHover',
    totalEsperado: 24,
  });
  assert.equal(cards.length, 24);
  assert.equal(state.visits.length, 3);
  assert.equal(state.closed(), true);
});