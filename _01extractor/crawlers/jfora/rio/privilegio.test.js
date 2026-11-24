import assert from "node:assert/strict";
import test from "node:test";
import { project } from "./rioPrivilegio/config.js";
import { buscarPaginaPrivilegio, coletarPrivilegio, mapearPrivilegio, urlBuscaPrivilegio } from "./privilegio.js";

const card = (codigo, overrides = {}) => ({
  codigo, finalidade: "Venda", tipo: "Apartamento", titulo: "Apartamento em Copacabana",
  bairro: "Copacabana", cidade: "Rio de Janeiro", estado: "RJ", endereco: "Rua Exemplo",
  valor: "R$ 1.250.000,00", numeroquartos: "2", numerobanhos: "1",
  numerosalas: "1", areaprincipal: "78,50", numerovagas: "1", numeroelevador: "0",
  urlfotoprincipal: "https://cdn.imoview.com.br/foto.jpg", ...overrides,
});

test("URL de busca especifica venda e pagina e recusa outros projetos", () => {
  const url = new URL(urlBuscaPrivilegio(project, "venda", 2));
  assert.equal(url.origin, "https://privilegioimoveis.com.br");
  assert.equal(url.searchParams.get("finalidade"), "2");
  assert.equal(url.searchParams.get("pagina"), "2");
  assert.equal(url.searchParams.get("por_pagina"), "100");
  assert.throws(() => urlBuscaPrivilegio(project, "locacao", 1), /invalidos/);
  assert.throws(() => urlBuscaPrivilegio(project, "venda", 0), /Pagina invalida/);
});

test("API valida total, pagina, quantidade de cards e HTTP", async () => {
  const result = { pagination: { total: 1, page: 1, per_page: 100 }, lista: [card(1)] };
  const response = data => async () => ({ ok: true, json: async () => data });
  assert.equal((await buscarPaginaPrivilegio(project, "venda", 1, response(result))).total, 1);
  await assert.rejects(buscarPaginaPrivilegio(project, "venda", 1, async () => ({ ok: false, status: 403 })), /HTTP 403/);
  for (const data of [{ ...result, lista: [] }, { ...result, pagination: { ...result.pagination, page: 2 } }, { ...result, pagination: { ...result.pagination, per_page: 20 } }]) {
    await assert.rejects(buscarPaginaPrivilegio(project, "venda", 1, response(data)));
  }
});

test("mapeia localizacao, bairro, preco e link; valida finalidade e dados", t => {
  const item = mapearPrivilegio(card(103678), project, new Date("2026-01-01T00:00:00Z"));
  assert.equal(Object.keys(item).length, 20);
  assert.equal(item.linkReal, "https://privilegioimoveis.com.br/imoveis/103678");
  assert.equal(item.bairro, "copacabana");
  assert.equal(item.cidade, "rio-de-janeiro-rj");
  assert.equal(item.localizacao, "Rua Exemplo, Copacabana, Rio de Janeiro - RJ");
  assert.equal(item.preco, 1250000);
  assert.equal(item.areaValor, 78.5);
  for (const overrides of [{ finalidade: "Aluguel" }, { bairro: "" }, { codigo: 0 }, { valor: "erro" }, { areaprincipal: "-1" }, { urlfotoprincipal: "http://example.com" }]) {
    assert.throws(() => mapearPrivilegio(card(1, overrides), project));
  }
  const warning = t.mock.method(console, "warn", () => {});
  const consulta = mapearPrivilegio(card(2, { tipo: "", valor: "Sob consulta" }), project);
  assert.equal(consulta.preco, null);
  assert.equal(consulta.tipoImovel, "");
  assert.equal(warning.mock.callCount(), 2);
  const intervalo = mapearPrivilegio(card(3, { numeroquartos: "0 até 0", areaprincipal: "0 m² até 0 m²" }), project);
  assert.equal(intervalo.dormitorioValor, 0);
  assert.equal(intervalo.areaValor, 0);
  assert.equal(mapearPrivilegio(card(5, { valor: "R$ 0,00 até R$ 0,00" }), project).preco, null);
  assert.throws(() => mapearPrivilegio(card(4, { numeroquartos: "1 até 3" }), project), /Quartos invalido/);
});

test("coleta paginada confirma ocorrencias e deduplica apenas registros identicos", async t => {
  const items = Array.from({ length: 100 }, (_, i) => card(i + 1));
  const buscar = async (_p, _n, page) => page === 1 ? { total: 101, items } : { total: 101, items: [card(101)] };
  const result = await coletarPrivilegio(null, project, "venda", { totalEsperado: 101 }, { buscar });
  assert.equal(result.length, 101);
  t.mock.method(console, "warn", () => {});
  const repeated = await coletarPrivilegio(null, project, "venda", { totalEsperado: 101 }, {
    buscar: async (_p, _n, page) => page === 1 ? { total: 101, items } : { total: 101, items: [card(1)] },
  });
  assert.equal(repeated.length, 100);
  await assert.rejects(coletarPrivilegio(null, project, "venda", { totalEsperado: 101 }, {
    buscar: async (_p, _n, page) => page === 1 ? { total: 101, items } : { total: 101, items: [card(1, { valor: "R$ 10,00" })] },
  }), /dados divergentes/);
  await assert.rejects(coletarPrivilegio(null, project, "venda", { totalEsperado: 101 }, {
    buscar: async () => ({ total: 100, items }),
  }), /Total alterado/);
  await assert.rejects(coletarPrivilegio(null, project, "venda", { totalEsperado: 101 }, {
    buscar: async () => { throw new Error("falha pagina"); },
  }), /falha pagina/);
  let calls = 0;
  await assert.rejects(coletarPrivilegio(null, project, "venda", { totalEsperado: 101 }, {
    buscar: async (_p, _n, page) => {
      calls++;
      if (calls === 3) return { total: 101, items: [...items].reverse() };
      return buscar(_p, _n, page);
    },
  }), /mudaram na reconferencia/);
});

test("check simples consulta somente primeira pagina", async () => {
  let calls = 0;
  const result = await coletarPrivilegio(null, project, "venda", { totalEsperado: 101, primeiraPagina: true }, {
    buscar: async (_p, _n, page) => { calls++; assert.equal(page, 1); return { total: 101, items: [card(1)] }; },
  });
  assert.equal(result.length, 1);
  assert.equal(calls, 1);
});
