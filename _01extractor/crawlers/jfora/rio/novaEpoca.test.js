import assert from "node:assert/strict";
import test from "node:test";
import { project } from "./rioNovaEpoca/config.js";
import { buscarPaginaNovaEpoca, coletarNovaEpoca, mapearNovaEpoca, urlBuscaNovaEpoca } from "./novaEpoca.js";

const card = (codigo, valorVenda, extra = {}) => ({
  id: codigo === "A1" ? 1 : codigo === "B1" ? 2 : 3, codigo, url: `venda+apartamento+${codigo}`, tipoAnuncio: "Imovel", tipo: "Apartamento",
  bairro: "Copacabana", cidade: "Rio de Janeiro", estadoSigla: "RJ",
  valorVenda, ocultarValor: false, quartos: 2, banheiros: 1, vagas: 1, areaConstruida: 80,
  imagens: ["123"], ...extra,
});
const first = card("A1", 50);
const boundary = card("B1", 100);
const last = card("C1", 300);
const configured = { ...project, novaEpoca: { limitesFaixasVenda: [100, 200] } };
const mockBusca = batches => async (_project, _negociacao, page, min, max) => {
  const key = `${min ?? ""},${max ?? ""}`;
  const items = batches[key] ?? [];
  return { total: items.length, page, pagesize: 100, items };
};

test("URL valida rota, pagina, finalidade e faixas inteiras", () => {
  const url = new URL(urlBuscaNovaEpoca(project, "venda", 3, 1000000, 2000000));
  assert.equal(url.origin, "https://www.novaepoca.com.br");
  assert.equal(url.searchParams.get("finalidade"), "venda");
  assert.equal(url.searchParams.get("page"), "3");
  assert.equal(url.searchParams.get("pagesize"), "100");
  assert.equal(url.searchParams.get("valorMinimo"), "1000000");
  assert.equal(url.searchParams.get("valorMaximo"), "2000000");
  assert.throws(() => urlBuscaNovaEpoca(project, "locacao", 1), /invalidos/);
  assert.throws(() => urlBuscaNovaEpoca(project, "venda", 0), /invalida/);
  assert.throws(() => urlBuscaNovaEpoca(project, "venda", 1, 200, 100), /invalida/);
});

test("API valida total, pagina, tamanho e erros HTTP", async () => {
  const response = data => async () => ({ ok: true, json: async () => data });
  const valid = { total: 1, page: 1, pagesize: 100, items: [first] };
  assert.equal((await buscarPaginaNovaEpoca(project, "venda", 1, undefined, undefined, response(valid))).total, 1);
  await assert.rejects(buscarPaginaNovaEpoca(project, "venda", 1, undefined, undefined, async () => ({ ok: false, status: 403 })), /HTTP 403/);
  for (const data of [{ ...valid, total: 2 }, { ...valid, page: 2 }, { ...valid, pagesize: 12 }, { ...valid, items: null }]) {
    await assert.rejects(buscarPaginaNovaEpoca(project, "venda", 1, undefined, undefined, response(data)));
  }
});

test("repete erro HTTP temporario sem aceitar resposta incompleta", async t => {
  let calls = 0;
  t.mock.method(console, "warn", () => {});
  const result = await buscarPaginaNovaEpoca(project, "venda", 1, undefined, undefined, async () => {
    calls++;
    return calls === 1 ? { ok: false, status: 500 } : {
      ok: true, json: async () => ({ total: 1, page: 1, pagesize: 100, items: [first] }),
    };
  });
  assert.equal(calls, 2);
  assert.equal(result.total, 1);
});

test("mapeia endereco, codigo, preco e imagens, sem aceitar dados ausentes ou ocultos", () => {
  const mapped = mapearNovaEpoca(first, project, new Date("2026-01-01T00:00:00Z"));
  assert.equal(Object.keys(mapped).length, 20);
  assert.equal(mapped.bairro, "copacabana");
  assert.equal(mapped.cidade, "rio-de-janeiro-rj");
  assert.equal(mapped.preco, 50);
  assert.equal(mapped.linkReal, "https://www.novaepoca.com.br/imovel/venda+apartamento+A1/1");
  assert.equal(mapped.linkFoto, "https://novaepoca.inforcedata.com.br/api/image/thumb/123.jpg");
  for (const invalid of [{ bairro: "" }, { tipoAnuncio: "Lançamento" }, { ocultarValor: true }, { valorVenda: 0 }, { url: "../outro" }, { imagens: ["x"] }, { id: 0 }, { quartos: -2 }]) {
    assert.throws(() => mapearNovaEpoca({ ...first, ...invalid }, project));
  }
});

test("quartos -1 sao tratados como desconhecidos com aviso", t => {
  const warning = t.mock.method(console, "warn", () => {});
  assert.equal(mapearNovaEpoca({ ...first, quartos: -1 }, project).dormitorioValor, 0);
  assert.equal(warning.mock.callCount(), 1);
});

test("coleta faixas sobrepostas, incluindo faixa vazia, e compara os limites", async () => {
  const items = await coletarNovaEpoca(null, configured, "venda", { totalEsperado: 3 }, {
    buscar: mockBusca({ ",100": [first, boundary], "100,200": [boundary], "200,": [last] }),
  });
  assert.deepEqual(items.map(item => item.codigoBase), ["A1", "B1", "C1"]);
  const vazio = await coletarNovaEpoca(null, configured, "venda", { totalEsperado: 1 }, {
    buscar: mockBusca({ ",100": [first] }),
  });
  assert.equal(vazio.length, 1);
});

test("rejeita conflitos, anuncios fora da faixa, duplicatas e totais incorretos", async () => {
  const run = (batches, total = 3) => coletarNovaEpoca(null, configured, "venda", { totalEsperado: total }, { buscar: mockBusca(batches) });
  await assert.rejects(run({ ",100": [first, boundary], "100,200": [card("B1", 100, { bairro: "Botafogo" })], "200,": [last] }), /divergente/);
  await assert.rejects(run({ ",100": [first, boundary], "100,200": [first], "200,": [last] }), /fora da faixa/);
  await assert.rejects(run({ ",100": [first, first], "200,": [last] }), /repetido na faixa/);
  await assert.rejects(run({ ",100": [first], "200,": [last] }), /Faixas incompletas/);
});

test("check simples consulta apenas a primeira pagina sem filtrar", async () => {
  let calls = 0;
  const result = await coletarNovaEpoca(null, configured, "venda", { totalEsperado: 1, primeiraPagina: true }, {
    buscar: async (_p, _n, page, min, max) => {
      calls++;
      assert.deepEqual([page, min, max], [1, undefined, undefined]);
      return { total: 1, items: [first] };
    },
  });
  assert.equal(result.length, 1);
  assert.equal(calls, 1);
});
