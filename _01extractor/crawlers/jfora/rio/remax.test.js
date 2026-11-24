import assert from "node:assert/strict";
import { test } from "node:test";
import { project } from "./rioRemax/config.js";
import { buscaRemaxRio, contarRemaxRio, coletarRemaxRio } from "./remax.js";
import { parseRemaxRecord } from "../niteroi/nitRemax/extractor.js";

const record = (id, changes = {}) => ({ content: {
  ListingKey: `key-${id}`, MLSID: `123-${id}`, CityID: 1, ProvinceID: 9517,
  TransactionTypeUID: 261, OnHoldListing: false, IsViewable: true,
  ShortLinks: [{ LanguageCode: "pt-BR", ShortLink: `pt-br/imoveis/chacara/-sitio/-fazenda/venda/tangua/123-${id}` }],
  City: "Tanguá", LocalZone: "Bairro desconhecido", FullAddress: "Rua Teste",
  ListingPrice: 100000, ListingCurrency: "BRL", HidePricePublic: false,
  ...changes,
} });
const options = { ...project, url: project.urlVendas, provinceId: 9517, transactionType: 261 };

test("rotas estaduais validam pais, estado e modalidade", () => {
  for (const [negociacao, uid] of [["venda", 261], ["locacao", 260]]) {
    const { body, transactionType } = buscaRemaxRio(project, negociacao);
    assert.equal(transactionType, uid);
    assert.match(body.filter, /ProvinceID eq 9517/);
    assert.match(body.filter, new RegExp(`TransactionTypeUID eq ${uid}`));
  }
  for (const suffix of ["&City=123", "&Province=1", "&CountryId=1", "#x"]) {
    assert.throws(() => buscaRemaxRio({ ...project, urlVendas: project.urlVendas + suffix }, "venda"), /Rota inesperada/);
  }
  assert.throws(() => buscaRemaxRio(project, "outro"), /invalida/);
});

test("parser estadual preserva bairro e valida cidade, modalidade e preco", () => {
  const item = parseRemaxRecord(record(1, { CommElevators: "Sim", HidePricePublic: true }), new Date(), options);
  assert.equal(item.cidade, "tangua-rj");
  assert.equal(item.bairro, "Bairro desconhecido");
  assert.equal(item.preco, null);
  assert.equal(item.elevadorValor, 1);
  for (const changes of [{ City: "Niterói" }, { ProvinceID: 1 }, { TransactionTypeUID: 260 }, { ListingPrice: -1 }]) {
    assert.throws(() => parseRemaxRecord(record(1, changes), new Date(), options));
  }
});

test("contagem e coleta validam vazio, lotes e duplicatas", async () => {
  const empty = async () => ({ "@odata.count": 0, value: [] });
  assert.equal(await contarRemaxRio(null, project, "venda", { request: empty }), 0);
  assert.deepEqual(await coletarRemaxRio(null, project, "venda", { totalEsperado: 0 }, { request: empty }), []);
  await assert.rejects(contarRemaxRio(null, project, "venda", { request: async () => ({ "@odata.count": "1", value: [record(1)] }) }), /Contagem invalida/);
  await assert.rejects(coletarRemaxRio(null, project, "venda", { totalEsperado: 2 }, { request: async () => ({ "@odata.count": 2, value: [record(1), record(1)] }) }), /repetida/);
  await assert.rejects(coletarRemaxRio(null, project, "venda", { totalEsperado: 2 }, { request: async () => ({ "@odata.count": 2, value: [record(1)] }) }), /incompleto/);
});

test("link ausente e recuperado a partir do tipo e confirmado na pagina", async () => {
  const missing = record(1, { PropertyTypeUID: 194, ShortLinks: [] });
  let calls = 0;
  const request = async body => {
    calls++;
    if (calls === 1) return { "@odata.count": 1, value: [missing] };
    assert.match(body.filter, /PropertyTypeUID eq 194/);
    return { value: [record(2)] };
  };
  let visited;
  let closed = false;
  const browserFactory = async () => ({
    newPage: async () => ({
      goto: async url => { visited = url; return { ok: () => true }; },
      url: () => visited,
      waitForFunction: async (_fn, _opts, code) => assert.equal(code, "123-1"),
    }),
    close: async () => { closed = true; },
  });
  const [item] = await coletarRemaxRio(null, project, "venda", { totalEsperado: 1 }, { request, browserFactory });
  assert.equal(visited, "https://www.remax.com.br/pt-br/imoveis/chacara/-sitio/-fazenda/venda/tangua/123-1");
  assert.equal(item.linkReal, visited);
  assert.equal(closed, true);
  calls = 0;
  await assert.rejects(coletarRemaxRio(null, project, "venda", { totalEsperado: 1 }, {
    request, browserFactory: async () => ({ newPage: async () => ({ goto: async () => ({ ok: () => true }), url: () => "https://www.remax.com.br/", waitForFunction: async () => { throw new Error("Pagina nao confirmou"); } }), close: async () => { closed = true; } }),
  }), /Pagina nao confirmou/);
});
