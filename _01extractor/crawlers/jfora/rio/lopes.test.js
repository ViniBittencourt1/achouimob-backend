import assert from "node:assert/strict";
import { test } from "node:test";
import { project as base } from "./rioLopes/config.js";
import { buscarPaginaLopes, coletarLopes, mapearLopes, urlApiLopes, urlBuscaLopes } from "./lopes.js";

const project = { ...base, kind: "lopes" };
const item = (id = "REO1") => ({
  id, productType: "real_estate", dealType: "rent", deal_types: ["rent", "sale"],
  type: "Apartamento", street: "Rua Exemplo", name: "",
  locationDTO: { neighborhood: "Centro", city: "Rio de Janeiro", uf: "rj" },
  attributes: [
    { type: "area_attr", value: "80m²" },
    { type: "bedroom_attr", value: "2" },
    { type: "bathroom_attr", value: "1" },
  ],
  subPrice: "Aluguel: R$ 2.000&nbsp;&nbsp; Condomínio: R$ 500",
  priceFormat: "R$ 500.000",
  photo: [{ smallUrl: "https://images.example.com/foto.jpg" }],
});

test("URLs preservam filtros e modalidade, mesmo depois da pagina 20", () => {
  const url = new URL(urlBuscaLopes(project, "locacao", 21));
  assert.equal(url.pathname, "/busca/aluguel/br/rj/pagina/21");
  assert.deepEqual(url.searchParams.getAll("estagio"), ["real_estate", "real_estate_parent"]);
  assert.equal(url.searchParams.get("placeId"), "ChIJw4riypQYmAAR0IMFwRrDSQM");
  const api = new URL(urlApiLopes(project, "locacao", 21, "ASC"));
  assert.equal(api.searchParams.get("page"), "20");
  assert.equal(api.searchParams.get("linesPerPage"), "100");
  assert.deepEqual(api.searchParams.getAll("productTypes"), ["real_estate", "real_estate_parent"]);
  assert.equal(api.searchParams.get("orderBy"), "PRICE");
  assert.deepEqual(new URL(urlApiLopes(project, "venda", 1, "ASC", "real_estate")).searchParams.getAll("productTypes"), ["real_estate"]);
  const faixa = new URL(urlApiLopes(project, "venda", 1, "", "real_estate", [500000, 1000000]));
  assert.equal(faixa.searchParams.get("minPrice"), "500000");
  assert.equal(faixa.searchParams.get("maxPrice"), "1000000");
  assert.throws(() => urlApiLopes(project, "locacao", 1, "", "real_estate", [0, 100]), /Faixa invalida/);
  assert.throws(() => urlBuscaLopes(project, "locacao", 0), /invalidos/);
  assert.throws(() => urlBuscaLopes({ ...project, urlLocacao: "https://example.com" }, "locacao", 1), /inesperada/);
});

test("le a pagina da API e valida finalidade e contagem", async () => {
  const body = page => ({
    products: { number: page, size: 100, totalElements: 101, numberOfElements: page ? 1 : 100, content: Array.from({ length: page ? 1 : 100 }, (_, i) => item(`REO${page * 100 + i}`)) },
    searchCriteria: { transactionType: "rent", characteristics: { searchLevel: "State" } },
  });
  const response = data => async () => ({ ok: true, json: async () => data });
  const result = await buscarPaginaLopes(project, "locacao", 2, response(body(1)));
  assert.equal(result.total, 101);
  assert.equal(result.items.length, 1);
  await assert.rejects(buscarPaginaLopes(project, "venda", 2, response(body(1))), /Resposta invalida/);
  const invalid = body(1);
  invalid.products.content = [];
  await assert.rejects(buscarPaginaLopes(project, "locacao", 2, response(invalid)), /incompleta/);
  await assert.rejects(buscarPaginaLopes(project, "locacao", 2, response(body(0))), /Resposta invalida/);
  await assert.rejects(buscarPaginaLopes(project, "locacao", 2, response({})), /Resposta invalida/);
});

test("aluguel usa valor proprio, bairro e link identificavel mesmo em anuncio tambem de venda", () => {
  const record = mapearLopes(item(), project, "locacao", new Date("2026-01-01T00:00:00Z"));
  assert.equal(record.preco, 2000);
  assert.equal(record.bairro, "centro");
  assert.equal(record.cidade, "rio-de-janeiro-rj");
  assert.equal(record.areaValor, 80);
  assert.equal(record.linkReal, "https://www.lopes.com.br/imovel/REO1");
  const foraDoEstado = mapearLopes({ ...item(), locationDTO: { neighborhood: "Centro", city: "Jundiaí", uf: "sp" } }, project, "locacao");
  assert.equal(foraDoEstado.cidade, "jundiai-sp");
  assert.throws(() => mapearLopes(item(), project, "venda"), /Anuncio invalido/);
  assert.throws(() => mapearLopes({ ...item(), locationDTO: { ...item().locationDTO, neighborhood: "" } }, project, "locacao"), /incompleto/);
});

test("tipos de condomínio da Lopes são registrados como casa", () => {
  for (const type of ["Condomínio", "Residential / Condo"]) {
    const record = mapearLopes({ ...item(), type }, project, "locacao");
    assert.equal(record.tipoImovel, "casa");
  }
});

test("lajes corporativas da Lopes usam o alias Laje do catálogo", () => {
  const record = mapearLopes({ ...item(), type: "Lajes Corporativas" }, project, "locacao");
  assert.equal(record.tipoImovel, "salao");
});

test("empreendimento de venda registra valores minimos das faixas e identifica preco inicial", () => {
  const parent = { ...item("REB1"), productType: "real_estate_parent", dealType: "sale", name: "Empreendimento", listingPrice: { type: "RANGE", minValue: 500000 }, attributes: [{ type: "area_attr", value: "91 a 278m²" }, { type: "bedroom_attr", value: "2 a 3" }] };
  const record = mapearLopes(parent, project, "venda");
  assert.equal(record.preco, 500000);
  assert.match(record.titulo, /preco a partir de/);
  assert.equal(record.areaValor, 91);
  assert.equal(record.dormitorioValor, 2);
  assert.throws(() => mapearLopes({ ...parent, listingPrice: { type: "RANGE", minValue: 400000 } }, project, "venda"), /Preco minimo divergente/);
});

test("repeticoes de paginas sao deduplicadas e novamente buscadas ate atingir o total", async () => {
  const items = Array.from({ length: 101 }, (_, i) => item(`REO${i + 1}`));
  let pageOneCalls = 0;
  const buscar = async (_project, _tipo, page) => {
    if (page === 1) { pageOneCalls++; return { total: 101, items: items.slice(0, 100) }; }
    return { total: 101, items: [pageOneCalls === 1 ? items[0] : items[100]] };
  };
  const result = await coletarLopes(null, project, "locacao", { totalEsperado: 101 }, { buscar });
  assert.equal(result.length, 101);
  assert.equal(pageOneCalls, 2);
});

test("divergencias, totais alterados e coleta incompleta impedem resultado parcial", async () => {
  const a = item("REO1");
  const b = { ...a, subPrice: "Aluguel: R$ 3.000" };
  let count = 0;
  await assert.rejects(coletarLopes(null, project, "locacao", { totalEsperado: 2 }, {
    buscar: async () => ({ total: 2, items: [count++ ? b : a] }),
  }), /Anuncio divergente/);
  await assert.rejects(coletarLopes(null, project, "locacao", { totalEsperado: 2 }, {
    buscar: async () => ({ total: 3, items: [a] }),
  }), /Total alterado/);
  await assert.rejects(coletarLopes(null, project, "locacao", { totalEsperado: 2 }, {
    buscar: async () => ({ total: 2, items: [a] }),
  }), /Coleta incompleta/);
});

test("venda valida e coleta separadamente imoveis e empreendimentos", async () => {
  const normal = { ...item("REO1"), dealType: "sale" };
  const parent = { ...item("REB1"), dealType: "sale", productType: "real_estate_parent" };
  const buscar = async (_project, _tipo, _page, _fetcher, _ordem, grupo, faixa) => {
    if (faixa && !(faixa[0] <= 500000 && (faixa[1] === null || faixa[1] >= 500000))) return { total: 0, items: [] };
    return { total: 1, items: [grupo === "real_estate" ? normal : parent] };
  };
  const records = await coletarLopes(null, project, "venda", { totalEsperado: 2 }, { buscar });
  assert.deepEqual(records.map(record => record.codigoBase), ["REO1", "REB1"]);
  await assert.rejects(coletarLopes(null, project, "venda", { totalEsperado: 3 }, { buscar }), /Totais por tipo divergem/);
  const wrongType = async (_project, _tipo, _page, _fetcher, _ordem, grupo, faixa) => {
    if (faixa && !(faixa[0] <= 500000 && (faixa[1] === null || faixa[1] >= 500000))) return { total: 0, items: [] };
    return { total: 1, items: [normal] };
  };
  await assert.rejects(coletarLopes(null, project, "venda", { totalEsperado: 2 }, { buscar: wrongType }), /Tipo inesperado/);
});
