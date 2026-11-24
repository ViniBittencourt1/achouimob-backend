import assert from "node:assert/strict";
import { test } from "node:test";
import { percorrerCatalogoMetropole, coletarHtmlsMetropole, lerPaginaApi } from "./metropole.js";
import { contarAntesDasVendas } from "../_utils/vendasContagem.js";

const base = "https://www.imobmetropole.com.br/imoveis/a-venda";

test("API respeita Retry-After e recupera apos bloqueio temporario", async t => {
  const waits = [];
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => ++calls === 1
    ? { ok: false, status: 429, headers: new Headers({ "retry-after": "45" }) }
    : { ok: true, status: 200, json: async () => ({ count: 1 }) });
  assert.deepEqual(await lerPaginaApi({ urlVendas: base }, 1, async ms => waits.push(ms)), { count: 1 });
  assert.deepEqual(waits, [45000]);
  assert.equal(calls, 2);
});

test("API falha explicitamente apos limite de tentativas por bloqueio", async t => {
  const waits = [];
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return { ok: false, status: 429, headers: new Headers() };
  });
  await assert.rejects(lerPaginaApi({ urlVendas: base }, 1, async ms => waits.push(ms)), /HTTP 429/);
  assert.deepEqual(waits, [30000, 60000, 120000]);
  assert.equal(calls, 4);
});

function fixture() {
  return [10, 11, 3, 0].map((length, index) => {
    const data = Array.from({ length }, (_, n) => ({
      url: `/imovel/apartamento/AP${index * 12 + n}`, updated_at: "2026-01-01T10:00:00",
    }));
    return {
      state: { count: 27 - [12, 12, 3, 0][index] + length, data, aggs: { geo_center: { count: 27 } } },
      cards: data.map(item => ({ href: item.url, html: `<a href="${item.url}">Apartamento</a>` })),
    };
  });
}

test("reconcilia omissoes por pagina e visita pagina terminal mesmo com paginas curtas", async () => {
  const pages = fixture();
  const visited = [];
  const result = await percorrerCatalogoMetropole(base, async n => { visited.push(n); return pages[n - 1]; });
  assert.deepEqual(visited, [1, 2, 3, 4]);
  assert.equal(result.totalBruto, 27);
  assert.equal(result.total, 24);
  assert.equal(result.htmls.length, 24);
  assert.equal(new Set(result.links).size, 24);
});

for (const [name, change] of [
  ["total bruto alterado", pages => { pages[1].state.aggs.geo_center.count = 28; }],
  ["contador sem reconciliacao", pages => { pages[1].state.count++; }],
  ["pagina repetida", pages => { pages[1] = structuredClone(pages[0]); }],
  ["cards ausentes", pages => { pages[1].cards.pop(); }],
  ["cards trocados", pages => { pages[1].cards[0].href = "/imovel/outro/AP999"; }],
  ["cards duplicados", pages => { pages[1].cards[1] = pages[1].cards[0]; }],
  ["resultado externo", pages => { pages[1].state.data[0].url = "https://example.com/imovel/AP1"; }],
  ["pagina vazia sem reconciliacao", pages => { pages[1].state.data = []; pages[1].cards = []; }],
  ["resposta invalida", pages => { pages[1].state = {}; }],
  ["pagina terminal com resultados", pages => { pages[3] = structuredClone(pages[2]); }],
]) {
  test(`preserva base em ${name}`, async () => {
    const pages = fixture();
    change(pages);
    await assert.rejects(percorrerCatalogoMetropole(base, async n => pages[n - 1]), { code: "KENLO_TOTAL_DIVERGENTE" });
  });
}

test("erro HTTP de uma pagina nao e convertido em catalogo parcial", async () => {
  await assert.rejects(percorrerCatalogoMetropole(base, async () => { throw new Error("HTTP 503"); }), /HTTP 503/);
});

test("zero exige ausencia de posicoes brutas e cards", async () => {
  const result = await percorrerCatalogoMetropole(base, async () => ({
    state: { count: 0, data: [], aggs: { geo_center: { count: 0 } } }, cards: [],
  }));
  assert.equal(result.total, 0);
  await assert.rejects(percorrerCatalogoMetropole(base, async () => ({
    state: { count: 0, data: [], aggs: { geo_center: { count: 12 } } }, cards: [],
  })), { code: "KENLO_TOTAL_DIVERGENTE" });
});

function browserFixture(pages) {
  let closed = false;
  let current;
  let index;
  const visited = [];
  const page = {
    setCacheEnabled: async () => {},
    setExtraHTTPHeaders: async () => {},
    goto: async url => { current = url; index = Number(new URL(url).searchParams.get("pagina")) - 1; visited.push(index + 1); return { ok: () => true, status: () => 200 }; },
    url: () => current,
    waitForFunction: async () => {},
    evaluate: async fn => fn.name === "readCardsMetropole" ? pages[index].cards : pages[index].state,
    close: async () => { closed = true; },
  };
  return { browser: { newPage: async () => page }, closed: () => closed, visited };
}

function mockApi(t, pages) {
  t.mock.method(globalThis, "fetch", async url => ({
    ok: true, json: async () => pages[Number(new URL(url).searchParams.get("pagina")) - 1].state,
  }));
  t.mock.method(globalThis, "setTimeout", callback => { queueMicrotask(callback); return 0; });
}

test("coleta fecha pagina e preserva base se precontagem divergir", async t => {
  const pages = fixture();
  mockApi(t, pages);
  const fake = browserFixture(pages);
  await assert.rejects(coletarHtmlsMetropole(fake.browser, { urlVendas: base }, { totalEsperado: 25 }), /Catalogo mudou/);
  assert.equal(fake.closed(), true);
});

test("coleta valida os mesmos links na segunda leitura e confirma terminal pela API", async t => {
  const pages = fixture();
  mockApi(t, pages);
  const fake = browserFixture(pages);
  const htmls = await coletarHtmlsMetropole(fake.browser, { urlVendas: base }, { totalEsperado: 24 });
  assert.equal(htmls.length, 24);
  assert.deepEqual(fake.visited, [1, 2, 3]);
  assert.equal(fake.closed(), true);
});

test("coleta aguarda e repete a pagina HTML bloqueada", async t => {
  const pages = fixture();
  mockApi(t, pages);
  const fake = browserFixture(pages);
  const page = await fake.browser.newPage();
  const goto = page.goto;
  let blocked = true;
  page.goto = async url => {
    if (blocked) {
      blocked = false;
      return { status: () => 429, headers: () => ({}) };
    }
    return goto(url);
  };
  const waits = [];
  const htmls = await coletarHtmlsMetropole({ newPage: async () => page }, { urlVendas: base }, {
    totalEsperado: 24, aguardar: async ms => waits.push(ms),
  });
  assert.equal(htmls.length, 24);
  assert.deepEqual(waits, [30000, 4000, 4000, 4000, 4000, 4000, 4000]);
  assert.equal(fake.closed(), true);
});

test("troca de identidade sem alterar total impede publicacao", async t => {
  const pages = fixture();
  const api = fixture();
  api[0].state.data[0].url = "/imovel/outro/AP999";
  mockApi(t, api);
  const fake = browserFixture(pages);
  await assert.rejects(coletarHtmlsMetropole(fake.browser, { urlVendas: base }, { totalEsperado: 24 }), /Identidades/);
  assert.equal(fake.closed(), true);
});

test("contagem independente nao executa projeto suspenso", async () => {
  await assert.rejects(contarAntesDasVendas(null, { projeto: "rioMetropole", salvar: false }), /sem configuracao/i);
});

test("check retorna somente primeira pagina e zero confirmado retorna lista vazia", async t => {
  const pages = fixture();
  mockApi(t, pages);
  const fake = browserFixture(pages);
  assert.equal((await coletarHtmlsMetropole(fake.browser, { urlVendas: base }, { totalEsperado: 24, primeiraPagina: true })).length, 10);
  const empty = [{ state: { count: 0, data: [], aggs: { geo_center: { count: 0 } } }, cards: [] }];
  mockApi(t, empty);
  assert.deepEqual(await coletarHtmlsMetropole(browserFixture(empty).browser, { urlVendas: base }, { totalEsperado: 0, primeiraPagina: true }), []);
});

test("versoes antigas do mesmo anuncio sao reconciliadas sem duplicar o resultado", async () => {
  const pages = fixture();
  pages[1].state.data[0] = { ...pages[0].state.data[0], updated_at: "2025-12-01T10:00:00" };
  pages[1].cards[0] = pages[0].cards[0];
  const result = await percorrerCatalogoMetropole(base, async n => pages[n - 1]);
  assert.equal(result.total, 23);
  assert.equal(result.htmls.length, 23);
});
