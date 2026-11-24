import assert from "node:assert/strict";
import test from "node:test";
import { project as config } from "./rioForte/config.js";
import { parametrosForte, buscarPaginaForte, mapearForte, coletarForte } from "./forte.js";

const project = { ...config, kind: "forte" };
function card(index, finalidade = "Venda") {
  return {
    codigo: index + 1, titulo: `casa-teste-${index}`, finalidade, tipo: "Casa",
    valor: "R$ 1.500.000,00", cidade: "Rio de Janeiro", estado: "RJ", bairro: "Campo Grande",
    endereco: "Rua A", numero: "***", numeroquartos: "2", numerobanhos: "1",
    numerosalas: "1", numerovagas: "1", areainterna: "80,00", areaprincipal: "80,00",
    arealote: "100,00", tipomedida: "m²", urlfotoprincipalp: "https://example.com/foto.jpg",
  };
}
function api(items, transform = (_page, result) => result) {
  const calls = [];
  return {
    calls,
    request: async (_url, options) => {
      const page = Number(options.body.get("imovel[pagina]"));
      calls.push(page);
      return { ok: true, json: async () => transform(page, { quantidade: items.length, lista: items.slice((page - 1) * 20, page * 20) }) };
    },
  };
}

test("buscas preservam finalidade, filtros e paginacao originais", () => {
  for (const [negociacao, finalidade] of [["venda", "venda"], ["locacao", "aluguel"]]) {
    const body = parametrosForte(project, negociacao, 2);
    assert.equal(body.get("imovel[finalidade]"), finalidade);
    assert.equal(body.get("imovel[pagina]"), "2");
    assert.equal(body.get("imovel[codigoTipo][codigo]"), "");
    assert.equal(body.get("imovel[codigocidade]"), "0");
    assert.equal(body.get("imovel[numeroregistros]"), "20");
  }
  assert.throws(() => parametrosForte({ ...project, urlLocacao: project.urlVendas }, "locacao", 1), /filtros/);
  assert.throws(() => parametrosForte(project, "venda", 0), /Pagina/);
});

test("mapeia valores, endereco e modalidades, sem incluir anuncios invalidos", () => {
  const result = mapearForte(card(0), project, "venda", new Date("2026-01-01T00:00:00Z"));
  assert.equal(result.linkReal, "https://www.forteimoveisconsultoria.com.br/imovel/casa-teste-0/1");
  assert.equal(result.preco, 1500000);
  assert.equal(result.areaValor, 80);
  assert.equal(result.cidade, "rio-de-janeiro-rj");
  assert.equal(result.codigoBase, "1");
  assert.equal(result.atualizadoEm, "2026-01-01T00:00:00.000Z");
  assert.equal(mapearForte(card(0, "Aluguel"), project, "locacao").preco, 1500000);
  assert.equal(mapearForte({ ...card(0), tipomedida: "alq." }, project, "venda").areaValor, 0);
  assert.throws(() => mapearForte(card(0), project, "locacao"), /fora de aluguel/);
  assert.throws(() => mapearForte({ ...card(0), titulo: "../teste" }, project, "venda"), /incompleto/);
  assert.throws(() => mapearForte({ ...card(0), valor: "invalido" }, project, "venda"), /preco invalido/);
});

test("percorre todas as paginas e permite aluguel vazio confirmado", async () => {
  const fake = api(Array.from({ length: 41 }, (_, i) => card(i)));
  const result = await coletarForte(null, project, "venda", { totalEsperado: 41, request: fake.request, aguardar: async () => {} });
  assert.equal(result.length, 41);
  assert.deepEqual(fake.calls, [1, 2, 3]);
  const empty = api([]);
  assert.deepEqual(await coletarForte(null, project, "locacao", { totalEsperado: 0, request: empty.request }), []);
  const check = api(Array.from({ length: 41 }, (_, i) => card(i)));
  assert.equal((await coletarForte(null, project, "venda", { totalEsperado: 41, primeiraPagina: true, request: check.request })).length, 20);
});

test("total instavel, paginas incompletas e codigos repetidos preservam dados", async () => {
  const items = Array.from({ length: 41 }, (_, i) => card(i));
  for (const fake of [
    api(items, (p, r) => p === 2 ? { ...r, quantidade: 42 } : r),
    api(items, (p, r) => p === 2 ? { ...r, lista: r.lista.slice(0, 5) } : r),
    api(items.map((item, i) => i === 21 ? items[0] : item)),
  ]) await assert.rejects(coletarForte(null, project, "venda", { totalEsperado: 41, request: fake.request, aguardar: async () => {} }), /preservados/);
  await assert.rejects(buscarPaginaForte(project, "venda", 1, { request: async () => ({ ok: false, status: 429 }) }), /HTTP 429/);
  await assert.rejects(buscarPaginaForte(project, "venda", 1, { request: async () => ({ ok: true, json: async () => ({ quantidade: null, lista: [] }) }) }), /Resposta invalida/);
});

test("repete apenas falhas transitorias de conexao e informa a falha final", async () => {
  let calls = 0;
  const connectionError = code => Object.assign(new TypeError("fetch failed"), { cause: { code } });
  const request = async () => {
    calls++;
    if (calls < 3) throw connectionError(calls === 1 ? "ETIMEDOUT" : "UND_ERR_SOCKET");
    return { ok: true, json: async () => ({ quantidade: 0, lista: [] }) };
  };
  assert.equal((await buscarPaginaForte(project, "venda", 1, { request, aguardar: async () => {} })).total, 0);
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(buscarPaginaForte(project, "venda", 1, {
    request: async () => { calls++; throw connectionError("ETIMEDOUT"); }, aguardar: async () => {},
  }), /fetch failed/);
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(buscarPaginaForte(project, "venda", 1, {
    request: async () => { calls++; throw new TypeError("outro erro"); }, aguardar: async () => {},
  }), /outro erro/);
  assert.equal(calls, 1);
});
