import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildUrlApiSelfSpin, coletar, contar, extrairEstadoSelfSpin, mapearImovelSelfSpin, resolverCidadeSelfSpin,
} from "./selfspin.js";

const project = Object.freeze({
  collection: "nitSelfSpin", displayName: "SelfSpin", kind: "selfspin",
  url: "https://www.selfspin.com.br/imoveis/para-alugar/brasil?order=mais_relevantes",
});
const now = new Date("2026-10-16T12:00:00.000Z");

function item(id, extra = {}) {
  return {
    id, imv_ativo: true, imv_cod_gaia: `AP${id}_SELF`, imv_titulo: "Apartamento para locação, Icaraí, Niterói, RJ",
    imv_preco_locacao: 2500, imv_ocultar_preco: false, imv_area_util: 70, imv_area_total: null,
    imv_qtd_dorm: 2, imv_qtd_banheiros: 1, imv_qtd_vagas: null, imv_estado: "RJ", imv_cidade: "Niterói",
    imv_bairro: "Icaraí", imv_hide_address_wl: false, imv_endereco: "Rua Gavião Peixoto", imv_end_numero: 100,
    url_amiga: `https://www.selfspin.com.br/imovel/apartamento/locacao/niteroi/rj/icarai/AP${id}_SELF`,
    tipo_imovel: { timv_nome: "Apartamento" }, tipo_negocio: { tpng_nome: "Locação" },
    fotos: [{ imvft_url: `https://static.arboimoveis.com.br/AP${id}_SELF/foto.jpg` }],
    ...extra,
  };
}

function html(ids, extra = {}) {
  const data = { props: { pageProps: {
    count: ids.length, locations: ids.map(id => ({ id })),
    request_filters: { tipovar: "para-alugar", center: { lat: -14.2, lng: -51.9 } }, ...extra,
  } } };
  return `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></html>`;
}

function fakeBrowser(pageHtml, apiItems, calls = []) {
  return {
    async newPage() {
      return {
        async setCacheEnabled() {},
        async goto() { return { ok: () => true, status: () => 200 }; },
        async content() { return pageHtml; },
        async evaluate(_fn, url) {
          if (_fn.name === "lerSiteDesativadoDOM") return false;
          calls.push(url);
          const ids = JSON.parse(new URL(url).searchParams.get("where")).id.inq;
          return ids.map(id => apiItems.get(id)).filter(Boolean).reverse();
        },
        async close() {},
      };
    },
  };
}

test("extrai total e ids do __NEXT_DATA__", () => {
  const estado = extrairEstadoSelfSpin(html([3, 1, 2]), project);
  assert.equal(estado.total, 3);
  assert.deepEqual(estado.ids, [3, 1, 2]);
  assert.throws(() => extrairEstadoSelfSpin("<html></html>", project), /__NEXT_DATA__/);
  assert.throws(() => extrairEstadoSelfSpin(html([1, 1]), project), /repetida/);
  assert.throws(() => extrairEstadoSelfSpin(html([1], { request_filters: { tipovar: "a-venda" } }), project), /fora de aluguel/);
});

test("monta URL da API Arbo por lote de ids", () => {
  const url = new URL(buildUrlApiSelfSpin([5, 6], { center: { lat: 1, lng: 2 } }));
  assert.equal(url.origin + url.pathname, "https://api-site.arboimoveis.com.br/api/imoveis-replica/get-imoveis-new");
  assert.deepEqual(JSON.parse(url.searchParams.get("where")), { id: { inq: [5, 6] } });
  assert.equal(url.searchParams.get("tipovar"), "para-alugar");
  assert.equal(url.searchParams.get("order"), "mais_relevantes");
});

test("resolve cidade pelo catalogo", () => {
  assert.equal(resolverCidadeSelfSpin("Niterói", "RJ"), "niteroi-rj");
  assert.equal(resolverCidadeSelfSpin("São Gonçalo", "rj"), "sao-goncalo-rj");
  assert.equal(resolverCidadeSelfSpin("Maricá", "RJ"), "marica-rj");
  assert.equal(resolverCidadeSelfSpin("Cidade Inexistente", "RJ"), "");
});

test("mapeia imovel da API para registro de aluguel", () => {
  const record = mapearImovelSelfSpin(item(10), project, now);
  assert.deepEqual(record, {
    linkReal: "https://www.selfspin.com.br/imovel/apartamento/locacao/niteroi/rj/icarai/AP10_SELF",
    titulo: "Apartamento para locação, Icaraí, Niterói, RJ", preco: 2500,
    localizacao: "Rua Gavião Peixoto, 100, Icaraí, Niterói, RJ", tipoImovel: "apartamento",
    bairro: "icarai", cidade: "niteroi-rj", dormitorioValor: 2, banheiroValor: 1, ambienteValor: 0,
    areaValor: 70, garagemValor: 0, elevadorValor: 0, codigoBase: "AP10_SELF",
    linkCard: "https://www.selfspin.com.br/imovel/apartamento/locacao/niteroi/rj/icarai/AP10_SELF",
    corretor: "SelfSpin", dataInclusao: now.toISOString(), dataExclusao: "",
    linkFoto: "https://static.arboimoveis.com.br/AP10_SELF/foto.jpg", atualizadoEm: now.toISOString(),
  });
});

test("oculta endereco, trata preco oculto, completa titulo e usa fallbacks de tipo e area", () => {
  const record = mapearImovelSelfSpin(item(11, {
    imv_hide_address_wl: true, imv_ocultar_preco: true, imv_titulo: "para locação, Centro, São Gonçalo, RJ",
    imv_cidade: "São Gonçalo", imv_bairro: "Centro", imv_area_util: null, imv_area_total: 120,
    tipo_imovel: { timv_nome: "Cobertura / Penthouse" }, fotos: [],
  }), project, now);
  assert.equal(record.preco, null);
  assert.equal(record.localizacao, "Centro, São Gonçalo, RJ");
  assert.equal(record.titulo, "Cobertura / Penthouse para locação, Centro, São Gonçalo, RJ");
  assert.equal(record.tipoImovel, "cobertura");
  assert.equal(record.cidade, "sao-goncalo-rj");
  assert.equal(record.areaValor, 120);
  assert.equal(record.linkFoto, "");
  const loja = mapearImovelSelfSpin(item(12, { tipo_imovel: { timv_nome: "Laje" }, imv_titulo: "Loja para locação, Centro, Niterói, RJ" }), project, now);
  assert.equal(loja.tipoImovel, "loja");
});

test("rejeita imovel fora de locacao, inativo ou com link de outro dominio", () => {
  assert.throws(() => mapearImovelSelfSpin(item(1, { tipo_negocio: { tpng_nome: "Venda" } }), project, now), /fora de locacao/);
  assert.throws(() => mapearImovelSelfSpin(item(1, { imv_ativo: false }), project, now), /inativo/);
  assert.throws(() => mapearImovelSelfSpin(item(1, { url_amiga: "https://outro.com/imovel/x" }), project, now), /Link inesperado/);
});

test("contar e coletar percorrem todos os lotes na ordem da listagem", async () => {
  const ids = Array.from({ length: 23 }, (_, index) => 100 + index);
  const api = new Map(ids.map(id => [id, item(id)]));
  const calls = [];
  const browser = fakeBrowser(html(ids), api, calls);
  assert.equal(await contar(browser, project), 23);
  const records = await coletar(browser, project, { totalEsperado: 23, check: false, anteriores: new Map() });
  assert.equal(records.length, 23);
  assert.equal(calls.length, 3);
  assert.deepEqual(records.map(record => record.codigoBase), ids.map(id => `AP${id}_SELF`));
});

test("check retorna apenas o primeiro lote", async () => {
  const ids = Array.from({ length: 15 }, (_, index) => 200 + index);
  const calls = [];
  const records = await coletar(fakeBrowser(html(ids), new Map(ids.map(id => [id, item(id)])), calls), project, { totalEsperado: 15, check: true });
  assert.equal(records.length, 10);
  assert.equal(calls.length, 1);
});

function browserComFalhaApi(ids, api, falhar) {
  const browser = fakeBrowser(html(ids), api);
  const newPage = browser.newPage;
  let closed = 0;
  browser.newPage = async () => {
    const page = await newPage();
    const evaluate = page.evaluate;
    page.evaluate = async (fn, url) => {
      if (fn.name === "fetchJsonSelfSpin") await falhar(url);
      return evaluate(fn, url);
    };
    page.close = async () => { closed++; };
    return page;
  };
  return { browser, closed: () => closed };
}

test("falha de rede no sexto lote usa Node com a mesma URL e preserva os lotes anteriores", async t => {
  const ids = Array.from({ length: 62 }, (_, index) => index + 1);
  const api = new Map(ids.map(id => [id, item(id)]));
  const urls = [];
  const warnings = [];
  t.mock.method(console, "warn", message => warnings.push(message));
  t.mock.method(globalThis, "fetch", async (url, options) => {
    urls.push(url);
    assert.equal(options.headers.From, "NEXT");
    const requested = JSON.parse(new URL(url).searchParams.get("where")).id.inq;
    return { ok: true, json: async () => requested.map(id => api.get(id)).reverse() };
  });
  let failedUrl;
  const fake = browserComFalhaApi(ids, api, async url => {
    if (JSON.parse(new URL(url).searchParams.get("where")).id.inq[0] === 51) {
      failedUrl = url;
      throw new TypeError("Failed to fetch");
    }
  });
  const records = await coletar(fake.browser, project, { totalEsperado: ids.length });
  assert.deepEqual(records.map(record => record.codigoBase), ids.map(id => `AP${id}_SELF`));
  assert.deepEqual(urls, [failedUrl]);
  assert.ok(warnings.some(message => message.includes("Consultando o mesmo lote pelo Node")));
  assert.equal(fake.closed(), 1);
});

test("falha nos dois transportes repete o lote com espera e limita a tres tentativas", async t => {
  const waits = [];
  const warnings = [];
  let browserCalls = 0;
  let nodeCalls = 0;
  const failure = new TypeError("fetch failed", { cause: Object.assign(new Error("conexao encerrada"), { code: "ECONNRESET" }) });
  t.mock.method(globalThis, "setTimeout", (callback, delay) => { waits.push(delay); callback(); });
  t.mock.method(console, "warn", message => warnings.push(message));
  t.mock.method(globalThis, "fetch", async () => { nodeCalls++; throw failure; });
  const fake = browserComFalhaApi([1], new Map(), async () => { browserCalls++; throw new TypeError("Failed to fetch"); });
  await assert.rejects(coletar(fake.browser, project, { totalEsperado: 1 }),
    error => /apos 3 tentativas.*ECONNRESET.*base preservada/.test(error.message) && error.cause === failure);
  assert.equal(browserCalls, 3);
  assert.equal(nodeCalls, 3);
  assert.deepEqual(waits, [2000, 4000]);
  assert.ok(warnings.some(message => message.includes("ECONNRESET")));
  assert.equal(fake.closed(), 1);
});

test("timeout do navegador usa Node e recupera apos falha temporaria nos dois transportes", async t => {
  const waits = [];
  let nodeCalls = 0;
  t.mock.method(console, "warn", () => {});
  t.mock.method(globalThis, "setTimeout", (callback, delay) => { waits.push(delay); callback(); });
  t.mock.method(globalThis, "fetch", async () => {
    if (++nodeCalls === 1) throw new TypeError("fetch failed");
    return { ok: true, json: async () => [item(1)] };
  });
  const fake = browserComFalhaApi([1], new Map(), async () => {
    throw Object.assign(new Error("signal timed out"), { name: "TimeoutError" });
  });
  const records = await coletar(fake.browser, project, { totalEsperado: 1 });
  assert.equal(records.length, 1);
  assert.equal(nodeCalls, 2);
  assert.deepEqual(waits, [2000]);
  assert.equal(fake.closed(), 1);
});

test("erros HTTP e de execucao no navegador nao acionam o transporte alternativo", async t => {
  t.mock.method(console, "warn", () => {});
  t.mock.method(globalThis, "setTimeout", callback => { callback(); });
  t.mock.method(globalThis, "fetch", async () => { assert.fail("Node nao deveria ser consultado"); });
  for (const message of ["API HTTP 403", "Unexpected token no JSON", "Target closed"]) {
    let calls = 0;
    const fake = browserComFalhaApi([1], new Map(), async () => { calls++; throw new Error(message); });
    await assert.rejects(coletar(fake.browser, project, { totalEsperado: 1 }), error => error.message.includes(message));
    assert.equal(calls, 3);
    assert.equal(fake.closed(), 1);
  }
});

test("resposta incompleta pelo Node nao autoriza coleta parcial", async t => {
  t.mock.method(console, "warn", () => {});
  t.mock.method(globalThis, "fetch", async () => ({ ok: true, json: async () => [item(1)] }));
  const fake = browserComFalhaApi([1, 2], new Map(), async () => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(coletar(fake.browser, project, { totalEsperado: 2 }), /incompleto/);
  assert.equal(fake.closed(), 1);
});

test("HTTP invalido no Node nao e tratado como resposta valida", async t => {
  let calls = 0;
  t.mock.method(console, "warn", () => {});
  t.mock.method(globalThis, "setTimeout", callback => { callback(); });
  t.mock.method(globalThis, "fetch", async () => { calls++; return { ok: false, status: 503 }; });
  const fake = browserComFalhaApi([1], new Map(), async () => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(coletar(fake.browser, project, { totalEsperado: 1 }), /apos 3 tentativas.*API HTTP 503.*base preservada/);
  assert.equal(calls, 3);
  assert.equal(fake.closed(), 1);
});

test("falha quando o total muda ou um lote volta incompleto", async () => {
  const ids = [1, 2, 3];
  const api = new Map(ids.map(id => [id, item(id)]));
  await assert.rejects(coletar(fakeBrowser(html(ids), api), project, { totalEsperado: 4 }), /Total mudou/);
  api.delete(2);
  await assert.rejects(coletar(fakeBrowser(html(ids), api), project, { totalEsperado: 3 }), /incompleto/);
  await assert.rejects(coletar(fakeBrowser(html(ids, { count: 5 }), api), project, { totalEsperado: 5 }), /difere da lista/);
});
