import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { mock, test } from "node:test";
import { project } from "./config.js";
import { projetoContagemVendas } from "../../_utils/vendasContagemProjetos.js";
import { validarUrlContagemVendas, parseTotalVendas } from "../../_utils/vendasContagem.js";
import { arquivoPrincipalVendas, reconciliarVendas } from "../../_utils/vendasSincronizacao.js";
import { consolidateData } from "../parser.js";
import order from "../../../../../crawler-order.cjs";

let franchiseCalls = 0;
let cached;
mock.module("../../remax/extractor-00-rotaInterna.js", { namedExports: {
  scrapeFranquias: async (_browser, records, previous) => {
    franchiseCalls++;
    cached = previous;
    for (const item of records) item.corretor = previous.get(item.linkReal)?.corretor || "Remax Nikiti";
  },
} });
const { parseRemaxRecord, isNiteroiSalesSearch, extractNiteroiRemaxSales, REMAX_SEARCH_ENDPOINT, requestRemaxSearch } = await import("./extractor.js");
const filter = "content/ProvinceID eq 9517 and content/CityID eq 6580792 and content/TransactionTypeUID eq 261";
const body = { count: true, skip: 0, top: 24, filter };
const raw = (id = 1, changes = {}) => ({ content: {
  ListingKey: `key-${id}`, MLSID: `631521015-${id}`,
  CityID: 6580792, ProvinceID: 9517, TransactionTypeUID: 261,
  OnHoldListing: false, IsViewable: true,
  ShortLinks: [{ LanguageCode: "pt-BR", ShortLink: `pt-br/imoveis/apartamento/venda/niteroi/rua-teste/631521015-${id}` }],
  LocalZone: "Icaraí", City: "Niterói", FullAddress: "Rua Teste, 20 - Icaraí, Niterói, Rio de Janeiro",
  ListingDescriptions: [{ LanguageCode: "pt-BR", DescriptionTypeUID: "1113", Description: "Apartamento à venda <b>em Icaraí</b>" }],
  HidePricePublic: false, ListingPrice: 550000.75, ListingCurrency: "BRL",
  NumberOfBedrooms: 3, NumberOfBathrooms: 2, TotalNumberOfLivingRooms: 1,
  TotalNumOfRooms: 8, LivingArea: 96.16, TotalArea: 125, LotSize2: 6500,
  ParkingSpaces: 4, NumberOfGarages: 1, CommElevators: "1",
  RegionId: 57, ListingImages: [{ Order: "2", FileName: "second.jpg" }, { Order: "1", FileName: "first.jpg" }],
  ...changes,
} });

test("cadastro integra script, painel, ordem, JSON e contagem filtrada por Niteroi", () => {
  const backendRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
  const pkg = JSON.parse(fs.readFileSync(path.join(backendRoot, "package.json")));
  assert.ok(pkg.scripts.nitremax.endsWith("/niteroi/nitRemax/index.js"));
  assert.ok(order.ORDEM_PROJETOS.includes(project.collection));
  assert.equal(arquivoPrincipalVendas("nitRemax.json"), true);
  const source = fs.readFileSync(new URL("../../_1Jf/jfora.js", import.meta.url), "utf8");
  const fn = source.slice(source.indexOf("function getCollectionNameForScript("), source.indexOf("\nfunction loadConfig("));
  const context = vm.createContext({ fs, path, backendRoot, extractJforaScripts: () => Object.entries(pkg.scripts).map(([name, cmd]) => ({ name, cmd })) });
  vm.runInContext(fn, context);
  assert.equal(vm.runInContext('getCollectionNameForScript("nitremax")', context), project.collection);
  const config = projetoContagemVendas(project.collection);
  assert.equal(parseTotalVendas("150 Número total de correspondências", config), 150);
  validarUrlContagemVendas(config, project.url);
  for (const url of [
    project.url.replace("City=6580792", "City=6579324"),
    project.url.replace("Province=9517", "Province=9512"),
    project.url.replace("TransactionTypeUID=261", "TransactionTypeUID=260"),
    project.url.replace("www.remax.com.br", "outro.example"),
  ]) assert.throws(() => validarUrlContagemVendas(config, url));
});

test("payload exige busca principal de venda, estado e cidade corretos", () => {
  assert.equal(isNiteroiSalesSearch(body), true);
  for (const changes of [
    { count: false }, { skip: 24 }, { top: 1 }, { filter: filter.replace("6580792", "6579324") },
    { filter: filter.replace("261", "260") }, { filter: `${filter} or true` },
  ]) assert.equal(isNiteroiSalesSearch({ ...body, ...changes }), false);
});

test("parser conserva 20 campos, precos decimais, contagens e primeira foto por ordem", () => {
  const record = parseRemaxRecord(raw());
  assert.equal(Object.keys(record).length, 20);
  assert.equal(record.titulo, "Apartamento à venda em Icaraí");
  assert.equal(record.preco, 550000.75);
  assert.equal(record.areaValor, 96.16);
  assert.equal(record.cidade, "niteroi-rj");
  assert.equal(record.bairro, "icarai");
  assert.equal(record.tipoImovel, "apartamento");
  assert.equal(record.banheiroValor, 2);
  assert.equal(record.dormitorioValor, 3);
  assert.equal(record.ambienteValor, 1);
  assert.equal(record.garagemValor, 4);
  assert.equal(record.elevadorValor, 1);
  assert.equal(record.linkFoto, "https://cdn.gryphtech.com/userimages/57/LargeWM/first.jpg");
  assert.equal(record.codigoBase, "631521015-1");
});

test("preco oculto nao vaza valor da API e alternativas de area e titulo sao deterministicas", () => {
  assert.equal(parseRemaxRecord(raw(1, { HidePricePublic: true, ListingPrice: 999999 })).preco, null);
  assert.equal(parseRemaxRecord(raw(1, { LivingArea: null })).areaValor, 125);
  assert.equal(parseRemaxRecord(raw(1, { LivingArea: null, TotalArea: 0 })).areaValor, 6500);
  assert.equal(parseRemaxRecord(raw(1, { ListingDescriptions: [] })).titulo, "apartamento a venda em Icaraí");
});

test("elevadores aceita negativa textual sem relaxar os demais campos numericos", () => {
  for (const [value, expected] of [
    ["N\u00e3o", 0], ["n\u00e3o", 0], [" N\u00c3O ", 0], ["Nao", 0],
    [null, 0], [undefined, 0], [0, 0], ["0", 0], ["1", 1], [4, 4],
  ]) {
    assert.equal(parseRemaxRecord(raw(1, { CommElevators: value })).elevadorValor, expected);
  }
  for (const value of ["desconhecido", "", -1, false, {}, NaN]) {
    assert.throws(() => parseRemaxRecord(raw(1, { CommElevators: value })), /elevadores invalido/);
  }
  for (const field of ["ListingPrice", "NumberOfBedrooms", "LivingArea", "ParkingSpaces"]) {
    assert.throws(() => parseRemaxRecord(raw(1, { [field]: "N\u00e3o" })), /invalido/);
  }
});

test("formato comercial com barra no tipo e bairro desconhecido nao interrompem", () => {
  const warn = console.warn;
  const warnings = [];
  console.warn = message => warnings.push(message);
  try {
    const record = parseRemaxRecord(raw(1, {
      LocalZone: "Bairro X",
      ShortLinks: [{ LanguageCode: "pt-BR", ShortLink: "pt-br/imoveis/cj-comercial/-sala/venda/niteroi/631521015-1" }],
    }));
    assert.equal(record.bairro, "Bairro X");
    assert.ok(warnings.some(message => message.includes("Bairro sem correspondencia")));
    assert.ok(record.tipoImovel);
  } finally { console.warn = warn; }
});

test("aluguel, outra cidade, anuncio indisponivel, URL, moeda e numeros invalidos falham", () => {
  for (const changes of [
    { CityID: 6579324 }, { ProvinceID: 9512 }, { TransactionTypeUID: 260 },
    { OnHoldListing: true }, { IsViewable: false }, { MLSID: "" },
    { ShortLinks: [{ LanguageCode: "pt-BR", ShortLink: "https://outro.example/imovel" }] },
    { ShortLinks: [{ LanguageCode: "pt-BR", ShortLink: "pt-br/imoveis/apartamento/alugar/niteroi/631521015-1" }] },
    { ListingPrice: null }, { ListingCurrency: "USD" }, { LivingArea: -1 }, { ParkingSpaces: "erro" },
    { ListingImages: [{ Order: "1", FileName: "../file.jpg" }] },
  ]) assert.throws(() => parseRemaxRecord(raw(1, changes)));
});

function fakeBrowser({ status = 200, redirect = project.url } = {}) {
  let closed = 0;
  const browser = { newPage: async () => ({
    waitForRequest: async predicate => {
      const request = { url: () => REMAX_SEARCH_ENDPOINT, method: () => "POST", postData: () => JSON.stringify(body) };
      assert.equal(predicate(request), true);
      return request;
    },
    goto: async () => ({ ok: () => status === 200, status: () => status }),
    url: () => redirect,
    close: async () => closed++,
  }) };
  return { browser, closed: () => closed };
}

test("coleta usa exclusao de chaves, verifica lotes e identifica franquias", async () => {
  const previousFetch = globalThis.fetch;
  const fake = fakeBrowser();
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    assert.equal(payload.skip, 0);
    calls++;
    if (calls === 2) assert.match(payload.filter, /not search.in/);
    const json = calls === 1 ? { "@odata.count": 25, value: Array.from({ length: 24 }, (_, i) => raw(i + 1)) }
      : { "@odata.count": 1, value: [raw(25)] };
    return { ok: true, json: async () => json };
  };
  try {
    const record = parseRemaxRecord(raw());
    const records = await extractNiteroiRemaxSales(fake.browser, {
      totalEsperado: 25, existingDataMap: new Map([
        [record.linkReal, { corretor: "Remax Nikiti" }], ["invalido", { corretor: "" }],
      ]),
    });
    assert.equal(records.length, 25);
    assert.equal(calls, 2);
    assert.equal(fake.closed(), 1);
    assert.equal(cached.size, 1);
    assert.ok(records.every(item => item.corretor === "Remax Nikiti"));
    const result = reconciliarVendas(records, [], consolidateData(records, new Map()), project.collection, { totalEsperado: 25 });
    assert.equal(result.ativos.length, 25);
  } finally { globalThis.fetch = previousFetch; }
});

test("check valida primeiro lote; total alterado, duplicatas e API falham antes de franquias", async () => {
  const previousFetch = globalThis.fetch;
  try {
    const first = Array.from({ length: 24 }, (_, i) => raw(i + 1));
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ "@odata.count": 25, value: first }) });
    assert.equal((await extractNiteroiRemaxSales(fakeBrowser().browser, { totalEsperado: 25, somentePrimeiraPagina: true })).length, 24);
    const before = franchiseCalls;
    for (const json of [
      { "@odata.count": 26, value: first }, { "@odata.count": 25, value: first.slice(1) },
      { "@odata.count": 25, value: [raw(1), raw(1)] }, { "@odata.count": 25, value: [] },
    ]) {
      globalThis.fetch = async () => ({ ok: true, json: async () => json });
      await assert.rejects(extractNiteroiRemaxSales(fakeBrowser().browser, { totalEsperado: 25 }));
    }
    globalThis.fetch = async () => ({ ok: false, status: 429 });
    await assert.rejects(requestRemaxSearch(body), /HTTP 429/);
    await assert.rejects(extractNiteroiRemaxSales(fakeBrowser({ status: 403 }).browser, { totalEsperado: 25 }), /HTTP 403/);
    await assert.rejects(extractNiteroiRemaxSales(fakeBrowser({ redirect: project.url.replace("6580792", "6579324") }).browser, { totalEsperado: 25 }));
    assert.equal(franchiseCalls, before);
    await assert.rejects(extractNiteroiRemaxSales(fakeBrowser().browser), /Precontagem/);
  } finally { globalThis.fetch = previousFetch; }
});

test("zero confirmado requer busca vazia e nao inventa anuncios", async () => {
  const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ "@odata.count": 0, value: [] }) });
    assert.deepEqual(await extractNiteroiRemaxSales(fakeBrowser().browser, { totalEsperado: 0 }), []);
  } finally { globalThis.fetch = previousFetch; }
});
