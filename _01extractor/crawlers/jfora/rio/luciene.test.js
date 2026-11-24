import assert from "node:assert/strict";
import test from "node:test";
import { project } from "./rioLuciene/config.js";
import { project as frConfig } from "./rioFr/config.js";
import { buscarLuciene, coletarLuciene, mapearLuciene, urlBuscaLuciene } from "./luciene.js";
const fr = { ...frConfig, kind: "netimoveis" };

function card(index, negociacao = "venda") {
  const codigo = Math.floor(index / 2) + 100;
  return {
    imovelSan_Id: codigo, tipoImovel1: "Apartamento 2 quartos", nomeCidade: "Rio de Janeiro", siglaEstado: "RJ",
    nomeBairro: "Copacabana", logradouroPublico: "", paramTransacao: negociacao,
    exibeVenda: 1, exibeLocacao: 1, valorImovel: 400000, valorLocacao: 2000,
    quartos: 2, banho: 1, sala: 1, areaRealPrivativa: 70, vagaGaragem: 0,
    elevadorSocial: true, elevadorDeServico: false, nomeArquivoThumb: "https://example.com/foto.webp",
    urlDetalheImovel: `imovel/${negociacao}-apartamento-variante-${index}/${codigo}/`,
  };
}

function api(items, transform = (_page, result) => result) {
  const calls = [];
  return {
    calls,
    request: async input => {
      const url = new URL(input);
      const page = Number(url.searchParams.get("pagina"));
      calls.push(page);
      const start = (page - 1) * 12;
      const size = page === 1 ? 14 : 36;
      const result = transform(page, { erro: false, totalDeRegistros: items.length, lista: items.slice(start, start + size) });
      return { ok: true, json: async () => result };
    },
  };
}

test("URLs preservam localizacao e filtro de apartamentos", () => {
  for (const negociacao of ["venda", "locacao"]) {
    const url = new URL(urlBuscaLuciene(project, negociacao, 3));
    assert.equal(url.searchParams.get("pagina"), "3");
    assert.equal(url.searchParams.get("transacao"), negociacao);
    assert.equal(url.searchParams.get(negociacao === "venda" ? "tipos" : "tipo"), negociacao === "venda" ? "todos" : "apartamento");
    assert.equal(JSON.parse(url.searchParams.get("localizacao"))[0].idLocalizacao, "BR-RJ");
    assert.throws(() => urlBuscaLuciene({ ...project, urlLocacao: project.urlVendas }, "locacao", 1), /Filtros/);
  }
});

test("FR preserva todos os tipos e aceita aluguel comercial ou preco zero sem alterar Luciene", () => {
  for (const negociacao of ["venda", "locacao"]) {
    const url = new URL(urlBuscaLuciene(fr, negociacao, 2));
    assert.equal(url.origin, "https://www.frimoveis.com.br");
    assert.equal(url.searchParams.get("tipos"), "todos");
    assert.equal(url.searchParams.get("tipo"), null);
    assert.equal(url.searchParams.get("transacao"), negociacao);
    assert.equal(JSON.parse(url.searchParams.get("localizacao"))[0].idLocalizacao, "BR-RJ");
  }
  const loja = { ...card(0, "locacao"), tipoImovel1: "Loja", valorLocacao: 0 };
  const mapped = mapearLuciene(loja, fr, "locacao");
  assert.equal(mapped.preco, 0);
  assert.equal(new URL(mapped.linkReal).origin, "https://www.frimoveis.com.br");
  assert.throws(() => mapearLuciene(loja, project, "locacao"), /fora dos filtros/);
  assert.throws(() => urlBuscaLuciene({ ...fr, urlLocacao: project.urlLocacao }, "locacao", 1), /Filtros/);
  assert.throws(() => mapearLuciene({ ...loja, urlDetalheImovel: "https://www.lucieneleitenetimoveis.com.br/imovel/locacao-loja/100/" }, fr, "locacao"), /Link inesperado/);
});

test("FR grava Lote-Área-Terreno como terreno em venda e locacao", () => {
  for (const [negociacao, tipoImovel1] of [["venda", "Lote-Área-Terreno"], ["locacao", "lote-area-terreno"]]) {
    const mapped = mapearLuciene({ ...card(0, negociacao), tipoImovel1 }, fr, negociacao);
    assert.equal(mapped.tipoImovel, "terreno");
  }
});

test("FR grava Kitchenette na categoria Kitnet (loft) em venda e locacao", () => {
  for (const negociacao of ["venda", "locacao"]) {
    const mapped = mapearLuciene({ ...card(0, negociacao), tipoImovel1: "Kitchenette" }, fr, negociacao);
    assert.equal(mapped.tipoImovel, "loft");
  }
});

test("FR grava Clínica como sala em venda e locacao", () => {
  for (const [negociacao, tipoImovel1] of [["venda", "Clínica"], ["locacao", "Clinica"]]) {
    const mapped = mapearLuciene({ ...card(0, negociacao), tipoImovel1 }, fr, negociacao);
    assert.equal(mapped.tipoImovel, "sala");
  }
});

test("Luciene grava Andar-pilotis como andar, conforme o catalogo", () => {
  const mapped = mapearLuciene({ ...card(0), tipoImovel1: "Andar-pilotis" }, project, "venda");
  assert.equal(mapped.tipoImovel, "andar");
});

test("FR coleta links distintos com mesmo codigo em todas as paginas", async () => {
  const items = Array.from({ length: 65 }, (_, i) => ({ ...card(i, "locacao"), tipoImovel1: "Loja" }));
  const fake = api(items);
  const result = await coletarLuciene(null, fr, "locacao", { totalEsperado: items.length, request: fake.request, aguardar: async () => {} });
  assert.equal(result.length, 65);
  assert.equal(new Set(result.map(item => item.linkReal)).size, 65);
  assert.equal(new Set(result.map(item => item.codigoBase)).size, 33);
  assert.deepEqual(fake.calls, [1, 2, 4]);
});

test("mapeia dados, preco por modalidade e links distintos de mesmo codigo", () => {
  const a = mapearLuciene(card(0), project, "venda", new Date("2026-01-01T00:00:00Z"));
  const b = mapearLuciene(card(1), project, "venda");
  assert.equal(a.codigoBase, b.codigoBase);
  assert.notEqual(a.linkReal, b.linkReal);
  assert.equal(a.preco, 400000);
  assert.equal(a.cidade, "rio-de-janeiro-rj");
  assert.equal(a.elevadorValor, 1);
  assert.equal(a.atualizadoEm, "2026-01-01T00:00:00.000Z");
  assert.equal(mapearLuciene(card(0, "locacao"), project, "locacao").preco, 2000);
  assert.throws(() => mapearLuciene({ ...card(0, "locacao"), tipoImovel1: "Casa" }, project, "locacao"), /fora dos filtros/);
  assert.throws(() => mapearLuciene({ ...card(0), urlDetalheImovel: "https://example.com/imovel/venda-casa/100/" }, project, "venda"), /Link inesperado/);
  assert.throws(() => mapearLuciene({ ...card(0), valorImovel: 0 }, project, "venda"), /Preco zero/);
});

test("percorre lotes com sobreposicao, conta links e aceita codigos repetidos", async () => {
  const items = Array.from({ length: 65 }, (_, i) => card(i));
  const fake = api(items);
  const result = await coletarLuciene(null, project, "venda", { totalEsperado: items.length, request: fake.request, aguardar: async () => {} });
  assert.equal(result.length, 65);
  assert.deepEqual(fake.calls, [1, 2, 4]);
  assert.equal(new Set(result.map(item => item.linkReal)).size, 65);
  assert.equal(new Set(result.map(item => item.codigoBase)).size, 33);
  const first = api(items);
  assert.equal((await coletarLuciene(null, project, "venda", { totalEsperado: 65, primeiraPagina: true, request: first.request })).length, 12);
  assert.deepEqual(first.calls, [1]);
});

test("falhas da API, paginas parciais, mudanca de ordem ou links repetidos abortam", async () => {
  const items = Array.from({ length: 65 }, (_, i) => card(i));
  for (const fake of [
    api(items, (p, r) => p === 2 ? { ...r, totalDeRegistros: 66 } : r),
    api(items, (p, r) => p === 2 ? { ...r, lista: r.lista.slice(0, 5) } : r),
    api(items, (p, r) => p === 4 ? { ...r, lista: [r.lista[1], r.lista[0], ...r.lista.slice(2)] } : r),
    api(items.map((item, index) => index === 15 ? items[0] : item)),
  ]) {
    await assert.rejects(coletarLuciene(null, project, "venda", { totalEsperado: 65, request: fake.request, aguardar: async () => {} }), /preservados/);
  }
  await assert.rejects(buscarLuciene(project, "venda", 1, { request: async () => ({ ok: false, status: 429 }) }), /HTTP 429/);
  await assert.rejects(buscarLuciene(project, "venda", 1, { request: async () => ({ ok: true, json: async () => ({ erro: true }) }) }), /Resposta invalida/);
  const empty = api([]);
  assert.deepEqual(await coletarLuciene(null, project, "venda", { totalEsperado: 0, request: empty.request }), []);
});
