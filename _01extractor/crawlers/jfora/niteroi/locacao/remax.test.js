import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { createRemaxSearchBatches } from "../../remax/paginacao-api.js";
import { getProjetoNiteroiLocacao } from "./projects.js";

mock.module("../../remax/paginacao-api.js", { namedExports: {
  createRemaxSearchBatches,
  installRemaxSearchBatches: async (_page, options) => {
    assert.deepEqual(options, { cityId: 6580792, transactionType: 260 });
    return { waitUntilReady: async () => 25, assertHealthy: () => {}, close: async () => {} };
  },
} });
const { contar, coletar } = await import("./remax.js");
const { isNiteroiSearch, isNiteroiSalesSearch, parseRemaxRecord, REMAX_SEARCH_ENDPOINT, validarBuscaLocacaoRemax } = await import("../nitRemax/extractor.js");

const project = { ...getProjetoNiteroiLocacao("nitRemax"), cityId: 6580792, provinceId: 9517, transactionType: 260 };
const body = { count: true, skip: 0, top: 24, filter: "content/ProvinceID eq 9517 and content/CityID eq 6580792 and content/TransactionTypeUID eq 260" };
const raw = (id = 1, changes = {}) => ({ content: {
  ListingKey: `key-${id}`, MLSID: `631741011-${id}`, CityID: 6580792, ProvinceID: 9517,
  TransactionTypeUID: 260, OnHoldListing: false, IsViewable: true,
  ShortLinks: [{ LanguageCode: "pt-BR", ShortLink: `pt-br/imoveis/apartamento/alugar/niteroi/rua-teste/631741011-${id}` }],
  LocalZone: "Icaraí", FullAddress: "Rua Teste, Icaraí, Niterói - RJ",
  ListingPrice: 2300.5, ListingCurrency: "BRL", HidePricePublic: false, ...changes,
} });
function fakeBrowser(redirect = project.url) {
  let closed = 0;
  return { newPage: async () => ({
    evaluate: async () => false,
    goto: async () => ({ ok: () => true, status: () => 200 }), url: () => redirect, close: async () => closed++,
    waitForFunction: async () => {}, $$eval: async () => "25 Número total de correspondências",
    waitForRequest: async predicate => {
      const request = { url: () => REMAX_SEARCH_ENDPOINT, method: () => "POST", postData: () => JSON.stringify(body) };
      assert.equal(predicate(request), true);
      return request;
    },
  }), closed: () => closed };
}

test("contagem RE/MAX e validacao restringem cidade, estado, origem e aluguel", async () => {
  const browser = fakeBrowser();
  assert.equal(await contar(browser, project), 25);
  assert.equal(browser.closed(), 1);
  for (const url of [project.url.replace("260", "261"), project.url.replace("6580792", "6579324"), project.url.replace("www.remax.com.br", "outro.example")]) assert.throws(() => validarBuscaLocacaoRemax(project, url));
  await assert.rejects(contar(fakeBrowser(project.url.replace("260", "261")), project), /fora da locacao/);
});

test("payload de aluguel nao relaxa o filtro de vendas", () => {
  assert.equal(isNiteroiSearch(body, 260), true);
  assert.equal(isNiteroiSalesSearch(body), false);
  for (const changes of [{ filter: `${body.filter} or true` }, { filter: body.filter.replace("260", "261") }, { skip: 24 }, { top: 1 }]) assert.equal(isNiteroiSearch({ ...body, ...changes }, 260), false);
});

test("parser usa ListingPrice de aluguel, resolve slugs e rejeita venda", () => {
  const parse = changes => parseRemaxRecord(raw(1, changes), new Date("2026-01-01T00:00:00Z"), project);
  const item = parse({});
  assert.equal(item.preco, 2300.5);
  assert.equal(item.tipoImovel, "apartamento");
  assert.equal(item.bairro, "icarai");
  assert.equal(item.cidade, "niteroi-rj");
  assert.equal(parse({ CommElevators: "N\u00e3o" }).elevadorValor, 0);
  assert.equal(parse({ CommElevators: "2" }).elevadorValor, 2);
  assert.throws(() => parse({ CommElevators: "invalido" }), /elevadores invalido/);
  assert.equal(parse({ HidePricePublic: true, ListingPrice: 999999 }).preco, null);
  assert.throws(() => parse({ TransactionTypeUID: 261 }));
  assert.throws(() => parse({ ShortLinks: [{ LanguageCode: "pt-BR", ShortLink: "pt-br/imoveis/apartamento/venda/niteroi/631741011-1" }] }));
  assert.throws(() => parse({ ListingCurrency: "USD" }));
});

test("coleta paginada usa exclusao de chaves, preserva data e nao consulta franquias", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    calls++;
    assert.equal(payload.skip, 0);
    if (calls === 2) assert.match(payload.filter, /not search.in/);
    return { ok: true, json: async () => calls === 1 ? { "@odata.count": 25, value: Array.from({ length: 24 }, (_, i) => raw(i + 1)) } : { "@odata.count": 1, value: [raw(25)] } };
  };
  try {
    const previous = parseRemaxRecord(raw(), new Date("2025-01-01T00:00:00Z"), project);
    const records = await coletar(fakeBrowser(), project, { totalEsperado: 25, anteriores: new Map([[previous.linkReal, previous]]) });
    assert.equal(records.length, 25);
    assert.equal(calls, 2);
    assert.equal(records[0].dataInclusao, previous.dataInclusao);
    assert.ok(records.every(item => item.corretor === project.displayName));
    calls = 0;
    assert.equal((await coletar(fakeBrowser(), project, { totalEsperado: 25, check: true })).length, 24);
    assert.equal(calls, 1);
    calls = 0;
    await assert.rejects(coletar(fakeBrowser(), project, { totalEsperado: 26 }), /Total alterado/);
  } finally { globalThis.fetch = original; }
});
