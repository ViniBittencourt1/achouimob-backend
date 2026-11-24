import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { collectCardsCrispi, readSnapshotCrispi } from './extractor.js';
import { extractTitulo } from './extractor-02-titulo.js';
import { extractPreco } from './extractor-03-preco.js';
import { extractLocalizacao } from './extractor-04-localizacao.js';
import { extractCidadeFromCardHtml } from './extractor-07-cidade.js';
import { extractDormitorioValor } from './extractor-08-dormitorioValor.js';
import { extractBanheiroValor } from './extractor-09-banheiroValor.js';
import { extractAreaValor } from './extractor-11-areaValor.js';
import { extractGaragemValor } from './extractor-12-garagemValor.js';
import { extractCodigoBase } from './extractor-14-codigoBase.js';
import { extractLinkFoto } from './extractor-19-linkFoto.js';

const base = 'https://www.crispiimoveis.com.br/imoveis/a-venda';

function fixture(total, { missing = false, status = 200, repeated = false } = {}) {
  let current = base;
  let closed = false;
  const visited = [];
  const page = {
    setUserAgent: async () => {}, setViewport: async () => {},
    goto: async url => { current = url; visited.push(url); return { status: () => status }; },
    url: () => current, waitForFunction: async () => {},
    evaluate: async callback => {
      const pageNumber = Number(new URL(current).searchParams.get('pagina') || 1);
      const start = repeated ? 0 : (pageNumber - 1) * 12;
      const cards = Array.from({ length: Math.min(12, total - start) }, (_, index) => `<a class="card-with-buttons borderHover" href="/imovel/${start + index + 1}?from=sale"><h2 class="card-with-buttons__heading">Passos - Juiz de Fora - MG</h2><p class="card-with-buttons__title">Apartamento</p><p class="card-with-buttons__value">R$ 900.000</p></a>`).join('');
      const next = missing || start + 12 >= total ? '' : `<a class="btn-next" href="${base}?pagina=${pageNumber + 1}"><span>Ver mais</span></a>`;
      const dom = new JSDOM(`<h1>${total}Imóveis à venda</h1>${cards}${next}<a class="btn-next" data-action="next" href="#next">Proximo</a>`, { url: current });
      const previous = globalThis.document;
      globalThis.document = dom.window.document;
      try { return callback(); }
      finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; dom.window.close(); }
    },
    close: async () => { closed = true; },
  };
  return { browser: { newPage: async () => page }, visited, closed: () => closed };
}

test('segue Ver mais em link e acumula os 303 imoveis das 26 paginas sem contar preco', async () => {
  const state = fixture(303);
  const cards = await collectCardsCrispi(state.browser, [base], { totalEsperado: 303 });
  assert.equal(cards.length, 303);
  assert.equal(state.visited.length, 26);
  assert.ok(state.visited.every(url => new URL(url).searchParams.get('ordenar') === 'recentes'));
  assert.equal(state.closed(), true);
});

test('paginacao ausente, sem progresso e HTTP invalido falham sem devolver lista parcial', async () => {
  for (const options of [{ missing: true }, { repeated: true }, { status: 403 }]) {
    const state = fixture(303, options);
    await assert.rejects(collectCardsCrispi(state.browser, [base]), /incompleta|parcial/);
    assert.equal(state.closed(), true);
  }
  const state = fixture(12);
  await assert.rejects(collectCardsCrispi(state.browser, [base], { totalEsperado: 303 }), /precontagem/);
});

test('snapshot deduplica pela URL mesmo quando HTML, fotos ou tracking mudam', () => {
  const dom = new JSDOM('<h1>1Imóveis à venda</h1><a href="/imovel/1?from=sale"><h3 class="card-text">Original</h3></a><a href="/imovel/1?from=outro"><h3 class="card-text">Foto atualizada</h3></a>', { url: base });
  const previous = globalThis.document;
  globalThis.document = dom.window.document;
  try { assert.equal(readSnapshotCrispi().cards.length, 1); }
  finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; dom.window.close(); }
});

test('zero confirmado encerra sem paginar e rota de aluguel e rejeitada', async () => {
  const state = fixture(0);
  assert.deepEqual(await collectCardsCrispi(state.browser, [base], { totalEsperado: 0 }), []);
  assert.equal(state.visited.length, 1);
  assert.equal(state.closed(), true);
  await assert.rejects(collectCardsCrispi(state.browser, [base.replace('a-venda', 'para-alugar')]), /rota de venda/);
});

test('layout atual preserva campos consumidos pelos extratores Crispi', () => {
  const dom = new JSDOM(`<h1>1 Imoveis a venda</h1>
    <a class="card-with-buttons borderHover" href="/imovel/apartamento/AP0142-CRMQ?from=sale">
      <h2 class="card-with-buttons__heading">Passos - Juiz de Fora - MG</h2>
      <p class="card-with-buttons__title">Apartamento</p>
      <p class="card-with-buttons__code">AP0142-CRMQ</p>
      <p class="card-with-buttons__value">R$ 398.000</p>
      <ul><li>95 m²</li><li>3 Quartos</li><li>2 Banheiros</li><li>1 Vaga</li></ul>
      <img class="cards_digital_carousel-image" src="https://imgs.kenlo.io/foto.jpg">
    </a>`, { url: base });
  const previous = globalThis.document;
  globalThis.document = dom.window.document;
  try {
    const { cards } = readSnapshotCrispi();
    assert.equal(cards.length, 1);
    assert.equal(cards[0].href, 'https://www.crispiimoveis.com.br/imovel/apartamento/AP0142-CRMQ');
    const html = cards[0].html;
    assert.equal(extractTitulo(html), 'Apartamento em Juiz de Fora');
    assert.equal(extractPreco(html), 398000);
    assert.equal(extractLocalizacao(html), 'Passos - Juiz de Fora');
    assert.equal(extractCidadeFromCardHtml(html), 'juiz-de-fora-mg');
    assert.equal(extractDormitorioValor(html), 3);
    assert.equal(extractBanheiroValor(html), 2);
    assert.equal(extractAreaValor(html), 95);
    assert.equal(extractGaragemValor(html), 1);
    assert.equal(extractCodigoBase(html), 'AP0142-CRMQ');
    assert.equal(extractLinkFoto(html), 'https://imgs.kenlo.io/foto.jpg');
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
    dom.window.close();
  }
});