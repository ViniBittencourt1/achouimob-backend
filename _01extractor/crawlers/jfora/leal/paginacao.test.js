import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { coletarPaginasKenloVendas, readSnapshotLeal } from '../_utils/vendasKenloPaginacao.js';
import { extractLocalData } from './extractor.js';

const base = 'https://www.lealimoveismb.com.br/imoveis/a-venda';

function fixture({ missing = false, status = 200, total = 757, url = base, duplicateFirstPass = false, duplicateAlways = false, modern = false } = {}) {
  let current = url;
  let closed = false;
  let passes = 0;
  const visits = [];
  const page = {
    setUserAgent: async () => {}, setViewport: async () => {},
    goto: async url => {
      current = url;
      if (!new URL(url).searchParams.has('pagina')) passes++;
      visits.push(url);
      return { status: () => status };
    }, url: () => current,
    close: async () => { closed = true; },
    evaluate: async callback => {
      const number = Number(new URL(current).searchParams.get('pagina') || 1);
      const start = (number - 1) * 12;
      const cards = Array.from({ length: Math.min(12, total - start) }, (_, index) => {
        const originalCode = start + index + 1;
        const code = originalCode === 13 && (duplicateAlways || (duplicateFirstPass && passes === 1)) ? 12 : originalCode;
        if (modern) return `<a class="card-with-buttons borderHover" href="/imovel/apartamento-${code}/AP${code}?from=sale">
          <img class="cards_digital_carousel-image" src="https://example.com/foto-${code}.jpg">
          <p class="card-with-buttons__code">AP${code}</p><p class="card-with-buttons__title">Apartamento</p>
          <h2 class="card-with-buttons__heading">Bandeirantes - Juiz de Fora - MG</h2>
          <ul><li>75,5 m²</li><li>2 Quartos</li><li>1 Banheiro</li><li>3 Vagas</li></ul>
          <p class="card-with-buttons__value">R$ 300.000</p></a>`;
        return `<div class="card card-listing"><a href="/imovel/${code}?from=sale"><h3 class="card-text">Apartamento em Centro</h3><h2 class="card-title">Centro</h2></a>
          <a href="/imovel/${code}"><img class="card-img-top" src="https://example.com/foto-${code}.jpg"></a>
          <span class="h-money location">R$ 300.000</span><div class="values"><div class="value"><p>2 quartos</p></div></div>
          <small class="reference property_full_reference pull-right">${code}</small><a href="https://api.whatsapp.com/send?text=/imovel/${code}">Contato</a></div>`;
      }).join('');
      const next = missing || start + 12 >= total ? '' : `<a class="btn-next" href="${url}?pagina=${number + 1}">Ver mais</a>`;
      const dom = new JSDOM(`<h1>${total}Imóveis à venda</h1>${cards}${next}`, { url: current });
      const previous = globalThis.document;
      globalThis.document = dom.window.document;
      try { return callback(); }
      finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; dom.window.close(); }
    },
  };
  page.waitForFunction = async (callback, _options, ...args) => {
    assert.ok(await page.evaluate(() => callback(...args)), 'DOM deve satisfazer a espera pelos cards');
  };
  return { browser: { newPage: async () => page }, visits, closed: () => closed };
}

test('Leal reconhece cards modernos inclusive na ultima pagina sem Ver mais', async () => {
  const state = fixture({ modern: true, total: 13 });
  const imoveis = await extractLocalData(state.browser, [base], { totalEsperado: 13 });
  assert.equal(imoveis.length, 13);
  assert.equal(new Set(imoveis.map(imovel => imovel.linkReal)).size, 13);
  assert.equal(state.visits.length, 2);
  assert.equal(state.closed(), true);
  const first = imoveis[0];
  assert.equal(Object.keys(first).length, 20);
  assert.equal(first.titulo, 'Apartamento em Juiz de Fora');
  assert.equal(first.cidade, 'juiz-de-fora-mg');
  assert.equal(first.bairro, 'bandeirantes');
  assert.equal(first.preco, 300000);
  assert.equal(first.codigoBase, 'AP1');
  assert.equal(first.linkFoto, 'https://example.com/foto-1.jpg');
  assert.equal(first.areaValor, 75.5);
  assert.equal(first.dormitorioValor, 2);
  assert.equal(first.banheiroValor, 1);
  assert.equal(first.garagemValor, 3);
});

for (const project of [
  { collection: 'jfLeal', total: 757, url: base },
  { collection: 'jfOliver', total: 60, url: 'https://www.oliverimoveisjf.com.br/imoveis/a-venda' },
]) {
test(`${project.collection} coleta ${project.total} cards preservando foto e codigo fora do link de titulo`, async () => {
  const state = fixture(project);
  const cards = await coletarPaginasKenloVendas(state.browser, [project.url], { projeto: project.collection, readSnapshot: readSnapshotLeal, cardSelector: '.card.card-listing', totalEsperado: project.total });
  assert.equal(cards.length, project.total);
  assert.equal(state.visits.length, Math.ceil(project.total / 12));
  assert.ok(state.visits.every(url => new URL(url).searchParams.get('ordenar') === 'recentes'));
  assert.ok(cards[0].includes('https://example.com/foto-1.jpg'));
  assert.ok(cards[0].includes('pull-right">1</small>'));
  assert.ok(!cards[0].includes('api.whatsapp.com'));
  assert.equal(state.closed(), true);
});
}

test('Leal nao devolve 12 como sucesso se pagina estiver ausente ou indisponivel', async () => {
  for (const options of [{ missing: true }, { status: 503 }]) {
    const state = fixture(options);
    await assert.rejects(coletarPaginasKenloVendas(state.browser, [base], { projeto: 'jfLeal', readSnapshot: readSnapshotLeal, cardSelector: '.card.card-listing', totalEsperado: 757, maxTentativasPagina: 1 }), /incompleta|parcial/);
    assert.equal(state.closed(), true);
  }
});

test('Leal reinicia uma coleta incompleta por repeticao temporaria de card', async () => {
  const state = fixture({ total: 24, duplicateFirstPass: true });
  const cards = await coletarPaginasKenloVendas(state.browser, [base], { projeto: 'jfLeal', readSnapshot: readSnapshotLeal, cardSelector: '.card.card-listing', totalEsperado: 24, maxTentativas: 2 });
  assert.equal(cards.length, 24);
  assert.equal(state.visits.length, 4);
  assert.equal(state.closed(), true);
});

test('Leal aborta se a coleta continuar incompleta depois de uma nova tentativa', async () => {
  const state = fixture({ total: 24, duplicateAlways: true });
  await assert.rejects(coletarPaginasKenloVendas(state.browser, [base], { projeto: 'jfLeal', readSnapshot: readSnapshotLeal, cardSelector: '.card.card-listing', totalEsperado: 24, maxTentativas: 2 }), /incompleta/);
  assert.equal(state.visits.length, 4);
  assert.equal(state.closed(), true);
});