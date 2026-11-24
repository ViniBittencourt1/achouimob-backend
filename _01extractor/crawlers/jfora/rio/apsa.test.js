import assert from "node:assert/strict";
import { test } from "node:test";
import { buscarBairroApsa, buscarPaginaApsa, coletarApsa, mapearApsa, resolverEnderecoApi } from "./apsa.js";

const card = overrides => ({ properties: {
  cdCidade: "7043", flgAluguel: "S", tpObjImovel: "L",
  chImovel: "6212", cdImovel: "2624", noTpImovel: "Box / Garagem",
  endereco: "R URUGUAIANA", nrImovel: "39", vlrAluguel: "80.00",
  nrDorms: "0", nrBanheiros: "0", nrVagas: "1", vlrArea: "6.00",
  noEndFotoPrinc: "foto.jpg", ...overrides,
} });

test("mapeia o card de aluguel em vinte campos com cidade e finalidade validadas", () => {
  const record = mapearApsa(card(), new Date("2026-11-12T12:00:00Z"));
  assert.equal(Object.keys(record).length, 20);
  assert.equal(record.codigoBase, "6212");
  assert.equal(record.preco, 80);
  assert.equal(record.areaValor, 6);
  assert.equal(record.cidade, "rio-de-janeiro-rj");
  assert.equal(record.bairro, "");
  assert.equal(record.linkReal, "https://apsa.com.br/aluguel/detalhe/?codImovel=2624");
  assert.equal(record.linkFoto, "https://os.iy2b.com/objectstorage/portalkasa.com.br/storage/asp-pkasa/fotos/foto.jpg");
  for (const invalid of [
    { cdCidade: "999" }, { flgAluguel: "N" }, { tpObjImovel: "V" },
    { chImovel: "" }, { endereco: "" }, { vlrAluguel: "0" },
    { noEndFotoPrinc: "../fora.jpg" },
  ]) assert.throws(() => mapearApsa(card(invalid)));
});

test("coleta paginas completas e rejeita duplicatas, total alterado e pagina incompleta", async () => {
  const previous = process.env.APSA_API_URL;
  process.env.APSA_API_URL = "https://erp.iy2b.com/systemakers/sli/rest/msiteimobbuscaimv/post/pesquisar/pesqImoveis/asp-pkasa/teste/endpoint";
  try {
    const request = mode => async (_url, options) => {
      const body = JSON.parse(options.body);
      if (_url.includes("/pesqDetalheImovel/")) {
        return { ok: true, json: async () => ({ id: "detalhe", modeloPadrao: {
          cdImovel: body.cdImovel, cidade: "RIO DE JANEIRO", uf: "RJ", objetivo: "LOCACAO",
          bairro: mode === "sem-bairro" ? "" : mode === "fora-catalogo" ? "SAÚDE" : "COPACABANA",
        } }) };
      }
      const page = body.infoPag.nroPagina;
      const length = page === 1 ? 12 : mode === "incompleta" ? 0 : 1;
      const lista = Array.from({ length }, (_, i) => card({
        chImovel: String(page === 1 ? i + 1 : mode === "duplicada" ? 1 : 13),
        cdImovel: String(page === 1 ? i + 100 : 200),
      }));
      return { ok: true, json: async () => ({ mensagens: [
        ...(page === 1 ? [{ id: "totRegs", mensagem: mode === "total" ? "14" : "13" }] : []),
        { id: "listaGeoJsonVO", lista },
      ] }) };
    };
    const warn = console.warn;
    const log = console.log;
    console.warn = () => {};
    console.log = () => {};
    try {
      const items = await coletarApsa(null, null, "locacao", { totalEsperado: 13, request: request("ok") });
      assert.equal(items.length, 13);
      assert.ok(items.every(item => item.bairro === "copacabana" && item.localizacao.includes("COPACABANA")));
      const desconhecidos = await coletarApsa(null, null, "locacao", { totalEsperado: 13, primeiraPagina: true, request: request("fora-catalogo") });
      assert.ok(desconhecidos.every(item => item.bairro === "SAÚDE" && item.localizacao.includes("SAÚDE")));
      assert.equal((await coletarApsa(null, null, "locacao", { totalEsperado: 13, primeiraPagina: true, request: request("ok") })).length, 12);
      for (const mode of ["duplicada", "incompleta", "total", "sem-bairro"]) {
        await assert.rejects(coletarApsa(null, null, "locacao", { totalEsperado: 13, request: request(mode) }));
      }
    } finally { console.warn = warn; console.log = log; }
  } finally {
    if (previous === undefined) delete process.env.APSA_API_URL;
    else process.env.APSA_API_URL = previous;
  }
});

test("consulta detalhes e valida codigo, localidade, finalidade e bairro", async () => {
  const previous = process.env.APSA_API_URL;
  process.env.APSA_API_URL = "https://erp.iy2b.com/systemakers/sli/rest/msiteimobbuscaimv/post/pesquisar/pesqImoveis/asp-pkasa/teste/endpoint";
  try {
    const detail = { cdImovel: 2624, cidade: "RIO DE JANEIRO", uf: "RJ", objetivo: "LOCACAO", bairro: "CENTRO" };
    const request = modeloPadrao => async (url, options) => {
      assert.match(url, /\/pesqDetalheImovel\//);
      assert.deepEqual(JSON.parse(options.body), { cdPessoaEmpOrigem: "{{EMPRESA_ORIGEM}}", cdImovel: "2624" });
      return { ok: true, json: async () => ({ id: "detalhe", modeloPadrao }) };
    };
    assert.equal(await buscarBairroApsa("2624", { request: request(detail) }), "CENTRO");
    for (const invalid of [
      { cdImovel: 1 }, { cidade: "NITEROI" }, { uf: "SP" },
      { objetivo: "VENDA" }, { bairro: "" }, { bairro: null },
    ]) await assert.rejects(buscarBairroApsa("2624", { request: request({ ...detail, ...invalid }) }), /Detalhes invalidos/);
    await assert.rejects(buscarBairroApsa("2624", { request: async () => ({ ok: false, status: 503 }) }), /HTTP 503/);
    await assert.rejects(buscarBairroApsa("../2624", { request: request(detail) }), /Codigo interno invalido/);
  } finally {
    if (previous === undefined) delete process.env.APSA_API_URL;
    else process.env.APSA_API_URL = previous;
  }
});

test("envia o filtro exato e valida contagem, status e resposta", async () => {
  const previous = process.env.APSA_API_URL;
  process.env.APSA_API_URL = "https://erp.iy2b.com/systemakers/sli/rest/msiteimobbuscaimv/post/pesquisar/pesqImoveis/asp-pkasa/teste/endpoint";
  try {
    const request = async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.tipoFiltro, "L");
      assert.equal(body.tpObjImovel, "L");
      assert.equal(body.lstAondeLocal, "5");
      assert.equal(body.infoPag.nroPagina, 1);
      return { ok: true, json: async () => ({ mensagens: [
        { id: "totRegs", mensagem: "1" }, { id: "listaGeoJsonVO", lista: [card()] },
      ] }) };
    };
    assert.equal((await buscarPaginaApsa(1, { request })).total, 1);
    await assert.rejects(buscarPaginaApsa(1, { request: async () => ({ ok: false, status: 403 }) }), /HTTP 403/);
    await assert.rejects(buscarPaginaApsa(1, { request: async () => ({ ok: true, json: async () => ({ mensagens: [] }) }) }), /Resposta invalida/);
    process.env.APSA_API_URL = "https://example.com/";
    await assert.rejects(buscarPaginaApsa(1, { request }), /nao corresponde/);
  } finally {
    if (previous === undefined) delete process.env.APSA_API_URL;
    else process.env.APSA_API_URL = previous;
  }
});

test("usa ambiente do processo ou configuracao do usuario Windows, sem ocultar falhas", () => {
  const url = "https://erp.iy2b.com/systemakers/sli/rest/msiteimobbuscaimv/post/pesquisar/pesqImoveis/asp-pkasa/teste/endpoint";
  let leituras = 0;
  const lerUsuario = () => { leituras++; return url; };
  assert.equal(resolverEnderecoApi({ value: url, platform: "win32", lerUsuario }), url);
  assert.equal(leituras, 0);
  assert.equal(resolverEnderecoApi({ value: "", platform: "win32", lerUsuario }), url);
  assert.equal(leituras, 1);
  assert.throws(() => resolverEnderecoApi({ value: "https://example.com", platform: "win32", lerUsuario }), /nao corresponde/);
  assert.equal(leituras, 1);
  assert.throws(() => resolverEnderecoApi({ value: "", platform: "linux", lerUsuario }), /Defina APSA_API_URL/);
  assert.throws(() => resolverEnderecoApi({ value: "", platform: "win32", lerUsuario: () => { throw new Error("falha na leitura"); } }), /falha na leitura/);
  assert.throws(() => resolverEnderecoApi({ value: "", platform: "win32", lerUsuario: () => "https://example.com" }), /nao corresponde/);
});
