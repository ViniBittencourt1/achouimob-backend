import assert from "node:assert/strict";
import { test } from "node:test";
import {
  validarUrlRemaxUba, isBuscaRemaxUba, parseRemaxUba, coletarRemaxUba,
} from "./extractor.js";
import { project } from "./config.js";
import { REMAX_SEARCH_ENDPOINT } from "../../niteroi/nitRemax/extractor.js";
import { CABECALHO_SHEETS } from "../../_utils/sheetsCampos.js";

const now = "2026-11-06T22:00:00.000Z";
function body(mode = "venda") {
  return {
    count: true, skip: 0, top: 24, search: "*",
    filter: `content/TenantId eq 6 and content/MacroRegionId eq 55 and content/OnHoldListing eq false and content/IsRegionalOffice eq false and content/IsViewable eq true and content/ProvinceID eq 9512 and content/CityID eq 6579726 and content/TransactionTypeUID eq ${mode === "venda" ? 261 : 260}`,
  };
}
function raw(id = 1, mode = "venda") {
  return { content: {
    ListingKey: `KEY-${id}`, MLSID: `860511003-${id}`, CityID: 6579726, ProvinceID: 9512,
    City: "Ub\u00e1", Province: "Minas Gerais", TransactionTypeUID: mode === "venda" ? 261 : 260,
    OnHoldListing: false, IsViewable: true, IsRegionalOffice: false,
    ShortLinks: [{ LanguageCode: "pt-BR", ShortLink: `pt-br/imoveis/casa/${mode === "venda" ? "venda" : "alugar"}/uba/860511003-${id}` }],
    ListingDescriptions: [{ LanguageCode: "pt-BR", DescriptionTypeUID: "1113", Description: "Casa &amp; Jardim" }],
    FullAddress: "Rua Um, 10, Centro, Ub\u00e1, Minas Gerais", LocalZone: "Centro",
    HidePricePublic: false, ListingCurrency: "BRL", ListingPrice: 190000.75,
    NumberOfBedrooms: 2, NumberOfBathrooms: 1, TotalNumberOfLivingRooms: null, TotalNumOfRooms: 8,
    LivingArea: null, TotalArea: 90, LotSize2: 300, ParkingSpaces: 0, NumberOfGarages: 2,
    CommElevators: null, RegionId: 86, ListingImages: [{ Order: "1", FileName: "foto.jpg" }],
  } };
}

test("URLs validam Uba, MG, todas as classes e finalidade sem filtros extras", () => {
  validarUrlRemaxUba(project.urlVendas, "venda");
  validarUrlRemaxUba(project.urlLocacao, "locacao");
  for (const url of [
    project.urlLocacao, project.urlVendas.replace("6579726", "6579324"),
    project.urlVendas.replace("9512", "9517"), project.urlVendas.replace("ListingClass=-1", "ListingClass=2"),
    project.urlVendas + "&minprice=100", project.urlVendas + "&TransactionTypeUID=260",
    project.urlVendas + "#x", project.urlVendas.replace("www.", ""),
  ]) assert.throws(() => validarUrlRemaxUba(url, "venda"), /Busca fora/);
  assert.throws(() => validarUrlRemaxUba(project.urlVendas, "outro"), /Negociacao/);
});

test("captura ignora busca geral, outra cidade/finalidade e filtros restritivos ou OR", () => {
  assert.equal(isBuscaRemaxUba(body(), "venda"), true);
  assert.equal(isBuscaRemaxUba(body("locacao"), "locacao"), true);
  for (const b of [
    { ...body(), count: false }, { ...body(), top: 1 }, { ...body(), skip: 24 }, { ...body(), search: "casa" },
    { ...body(), filter: body().filter.replace("6579726", "6579324") },
    { ...body(), filter: body().filter.replace("261", "260") },
    { ...body(), filter: body().filter + " and content/ListingPrice ge 100" },
    { ...body(), filter: body().filter + " or content/IsViewable eq false" },
    { ...body(), filter: "content/CityID eq 6579726" },
  ]) assert.equal(isBuscaRemaxUba(b, "venda"), false);
});

test("parser usa vinte campos, codigo publico, titulo oficial e numeros estruturados", () => {
  const result = parseRemaxUba(raw(), "venda", now);
  assert.deepEqual(Object.keys(result), CABECALHO_SHEETS);
  assert.equal(result.titulo, "Casa & Jardim");
  assert.equal(result.preco, 190000.75);
  assert.equal(result.tipoImovel, "casa");
  assert.equal(result.bairro, "centro");
  assert.equal(result.cidade, "uba-mg");
  assert.equal(result.areaValor, 90);
  assert.equal(result.ambienteValor, 8);
  assert.equal(result.garagemValor, 0);
  assert.equal(result.elevadorValor, null);
  assert.equal(result.codigoBase, "860511003-1");
  assert.equal(result.linkFoto, "https://cdn.gryphtech.com/userimages/86/LargeWM/foto.jpg");
  assert.equal(result.dataInclusao, now);
  const r = raw(1, "locacao");
  r.content.ListingPrice = 1500.75;
  assert.equal(parseRemaxUba(r, "locacao").preco, 1500.75);
});

test("ausencia numerica permanece null; zero explicito prevalece sobre campos alternativos", () => {
  const r = raw();
  Object.assign(r.content, {
    NumberOfBedrooms: null, NumberOfBathrooms: null, TotalNumberOfLivingRooms: 0,
    LivingArea: 0, TotalArea: 0, LotSize2: null, ParkingSpaces: null, NumberOfGarages: null,
  });
  const parsed = parseRemaxUba(r, "venda");
  assert.equal(parsed.dormitorioValor, null);
  assert.equal(parsed.banheiroValor, null);
  assert.equal(parsed.ambienteValor, 0);
  assert.equal(parsed.areaValor, 0);
  assert.equal(parsed.garagemValor, null);
});

test("area elevada do anuncio 860511003-15 e preservada exatamente, sem heuristica de correcao", () => {
  const r = raw(15);
  r.content.TotalArea = 0;
  r.content.LotSize2 = 2582740000;
  assert.equal(parseRemaxUba(r, "venda").areaValor, 2582740000);
});

test("precos ausentes/ocultos sao zero; tipos e cidades nao catalogados ficam vazios", () => {
  const r = raw();
  r.content.HidePricePublic = true;
  assert.equal(parseRemaxUba(r, "venda").preco, 0);
  r.content.HidePricePublic = false;
  r.content.ListingPrice = null;
  assert.equal(parseRemaxUba(r, "venda").preco, 0);
  r.content.ShortLinks[0].ShortLink = r.content.ShortLinks[0].ShortLink.replace("/casa/", "/categoria-desconhecida/");
  r.content.City = "Cidade desconhecida";
  const parsed = parseRemaxUba(r, "venda");
  assert.equal(parsed.tipoImovel, "");
  assert.equal(parsed.cidade, "");
});

test("registros fora da cidade, finalidade ou identidade e campos malformados bloqueiam coleta", () => {
  for (const mutate of [
    c => { c.CityID = 6579324; }, c => { c.ProvinceID = 9517; }, c => { c.TransactionTypeUID = 260; },
    c => { c.OnHoldListing = true; }, c => { c.IsViewable = false; }, c => { c.IsRegionalOffice = true; },
    c => { c.MLSID = "sem-codigo"; }, c => { c.ShortLinks = []; },
    c => { c.ShortLinks[0].ShortLink = c.ShortLinks[0].ShortLink.replace("/uba/", "/niteroi/"); },
    c => { c.ShortLinks[0].ShortLink = c.ShortLinks[0].ShortLink.replace("/venda/", "/alugar/"); },
    c => { c.ShortLinks[0].ShortLink = "https://outro.example/" + c.ShortLinks[0].ShortLink; },
    c => { c.ShortLinks[0].ShortLink += "?x=1"; }, c => { c.FullAddress = ""; },
    c => { c.ListingDescriptions = []; }, c => { c.ListingCurrency = "USD"; },
    c => { c.ListingPrice = -1; }, c => { c.NumberOfBedrooms = "2"; },
    c => { c.ParkingSpaces = 1.5; }, c => { c.ListingImages[0].FileName = "../foto.jpg"; },
  ]) {
    const r = raw(); mutate(r.content);
    assert.throws(() => parseRemaxUba(r, "venda"), /preservados/);
  }
});

function fixture({ mode = "venda", total = 26, failure, change = false, reorder = false } = {}) {
  const records = Array.from({ length: total }, (_, i) => raw(i + 1, mode));
  let closed = 0, rounds = 0;
  const payloads = [];
  const page = {
    url: () => {
      const url = new URL(mode === "venda" ? project.urlVendas : project.urlLocacao);
      url.searchParams.delete("City");
      url.searchParams.delete("Province");
      url.searchParams.set("TransactionTypeUID", "-1");
      return url.href;
    },
    goto: async () => ({ ok: () => failure !== "http", status: () => 500 }),
    waitForRequest: async predicate => {
      const request = (url, data) => ({ url: () => url, method: () => "POST", postData: () => JSON.stringify(data) });
      assert.equal(predicate(request(REMAX_SEARCH_ENDPOINT, { ...body(mode), count: false })), false);
      assert.equal(predicate(request("https://outro.example/", body(mode))), false);
      const valid = request(REMAX_SEARCH_ENDPOINT, body(mode));
      assert.equal(predicate(valid), true);
      return valid;
    },
    waitForFunction: async (_fn, _options, expected) => {
      if (failure === "ui") throw new Error("Pagina nao confirmou total/zero");
      if (typeof expected === "number") assert.equal(expected, total);
    },
    waitForSelector: async () => {},
    evaluate: async () => true,
    $$eval: async () => records.slice(0, 24).map(r =>
      failure === "link" ? "https://outro.example/" : parseRemaxUba(r, mode).linkReal),
    close: async () => { closed++; },
  };
  const requestSearch = async payload => {
    payloads.push(payload);
    assert.ok(payload.select.includes("content/ShortLinks"));
    const exclusion = payload.filter.match(/not search.in\(content\/ListingKey, '([^']+)'/);
    if (!exclusion) rounds++;
    const excluded = new Set(exclusion?.[1].split("|") ?? []);
    let remaining = records.filter(r => !excluded.has(r.content.ListingKey));
    if (reorder && rounds > 1) remaining = [...remaining].reverse();
    const value = structuredClone(remaining.slice(0, 24));
    if (change && rounds > 1 && value.length) value[0].content.ListingPrice++;
    if (failure === "partial") value.pop();
    return { "@odata.count": remaining.length, value };
  };
  return {
    records, payloads, requestSearch, newPage: async () => page,
    get closed() { return closed; },
  };
}

test("coletor valida filtros pela API mesmo com URL sem City/Province e finalidade -1", async () => {
  const browser = fixture({ reorder: true });
  const counts = [];
  const result = await coletarRemaxUba(browser, project, "venda", {
    requestSearch: browser.requestSearch,
    anteriores: new Map([[parseRemaxUba(raw(), "venda").linkReal, { dataInclusao: "2020-01-01" }]]),
    onCount: async total => counts.push(total),
  });
  assert.equal(result.totalEsperado, 26);
  assert.equal(result.imoveis.length, 26);
  assert.equal(result.imoveis[0].dataInclusao, "2020-01-01");
  assert.equal(browser.payloads.length, 4);
  assert.ok(browser.payloads[1].filter.includes("not search.in"));
  assert.deepEqual(counts, [26]);
  assert.equal(browser.closed, 1);
});

test("aluguel zero exige confirmacao de API e pagina oficial antes de permitir base vazia", async () => {
  const browser = fixture({ mode: "locacao", total: 0 });
  const counts = [];
  const result = await coletarRemaxUba(browser, project, "locacao", {
    requestSearch: browser.requestSearch, onCount: async total => counts.push(total),
  });
  assert.deepEqual(result, { imoveis: [], totalEsperado: 0, vazioConfirmado: true });
  assert.equal(browser.payloads.length, 2);
  assert.deepEqual(counts, [0]);
  assert.equal(browser.closed, 1);
  const invalid = fixture({ mode: "locacao", total: 0, failure: "ui" });
  await assert.rejects(coletarRemaxUba(invalid, project, "locacao", {
    requestSearch: invalid.requestSearch, onCount: async () => assert.fail("Nao deve registrar"),
  }), /Pagina nao confirmou/);
  assert.equal(invalid.closed, 1);
});

test("erros HTTP, lotes incompletos, links divergentes e dados alterados preservam base", async () => {
  for (const options of [{ failure: "http" }, { failure: "partial" }, { failure: "link" }, { change: true }]) {
    const browser = fixture(options);
    await assert.rejects(coletarRemaxUba(browser, project, "venda", {
      requestSearch: browser.requestSearch, onCount: async () => assert.fail("Nao deve registrar"),
    }), /preservados/);
    assert.equal(browser.closed, 1);
  }
});
