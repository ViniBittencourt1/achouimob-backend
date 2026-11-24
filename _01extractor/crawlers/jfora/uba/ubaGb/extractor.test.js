import assert from "node:assert/strict";
import { test } from "node:test";
import { coletarGb, lerPaginaGb, parseImovelGb, validarUrlGb } from "./extractor.js";
import { project } from "./config.js";
import { CABECALHO_SHEETS } from "../../_utils/sheetsCampos.js";

const now = "2026-11-06T18:00:00.000Z";
const record = (codigo = 1, overrides = {}) => ({
  codigo, finalidade: "Venda", titulo: "Loja comercial em Uba", tipo: "Loja",
  url_amigavel: `loja-em-uba-${codigo}`, valor: "R$ 350.000,75", valorcondominio: "R$ 250,00",
  bairro: "DICO TEIXEIRA", cidade: "Ub\u00e1", estado: "MG", endereco: "Rua Dico Teixeira",
  numero: "***", numeroquartos: "0", numerobanhos: "1", numerovagas: "0", numerosalas: "1",
  areainterna: "120,50", areaprincipal: "160,00", arealote: "0,00", tipomedida: "m\u00b2",
  urlfotoprincipalp: "https://cdn.imoview.com.br/gbnegocios/foto.jpg", ...overrides,
});
const batch = (quantidade, lista) => ({ quantidade, lista });
const records = (count, offset = 0, overrides = {}) => Array.from({ length: count }, (_, index) => record(offset + index + 1, overrides));

function fixture(batches, {
  negociacao = "venda", url, navigationOk = true, apiOk = true, body,
  failure, method = "POST", endpoint = "https://www.gbnimob.com.br/retornar-imoveis-disponiveis",
} = {}) {
  let index = 0;
  let closed = 0;
  let listening = false;
  const requests = [];
  const finalidade = negociacao === "venda" ? "venda" : "aluguel";
  const params = body ?? `finalidade=${finalidade}&numeropagina=1&numeroregistros=20&ordenacao=dataatualizacaodesc&codigocidade=0`;
  const response = {
    url: () => endpoint, ok: () => apiOk, status: () => 403,
    request: () => ({ method: () => method, postData: () => params }),
    json: async () => batches[0],
  };
  const page = {
    waitForResponse: async predicate => {
      listening = true;
      assert.equal(predicate(response), true);
      return response;
    },
    goto: async value => {
      assert.equal(listening, true);
      assert.equal(value, (negociacao === "venda" ? project.urlVendas : project.urlLocacao).replace("?&", "?"));
      return { ok: () => navigationOk, status: () => 500 };
    },
    url: () => url ?? (negociacao === "venda" ? project.urlVendas : project.urlLocacao),
    evaluate: async (fn, target, body) => {
      assert.equal(fn.name, "fetchRealizaPage");
      assert.equal(target, endpoint);
      const params = new URLSearchParams(body);
      assert.equal(params.get("finalidade"), finalidade);
      assert.equal(params.get("numeroregistros"), "20");
      requests.push(params.get("numeropagina"));
      if (failure) throw new Error(failure);
      return batches[++index];
    },
    close: async () => { closed++; },
  };
  return { browser: { newPage: async () => page }, requests, closed: () => closed };
}

test("parser produz vinte campos, slugs, preco sem condominio e numeros estruturados", () => {
  const result = parseImovelGb(record(), "venda", now);
  assert.deepEqual(Object.keys(result).sort(), [...CABECALHO_SHEETS].sort());
  assert.equal(result.preco, 350000.75);
  assert.equal(result.tipoImovel, "loja");
  assert.equal(result.cidade, "uba-mg");
  assert.equal(result.bairro, "dico-teixeira");
  assert.equal(result.localizacao, "Rua Dico Teixeira, DICO TEIXEIRA, Ub\u00e1, MG");
  assert.equal(result.areaValor, 120.5);
  assert.equal(result.dormitorioValor, 0);
  assert.equal(result.banheiroValor, 1);
  assert.equal(result.ambienteValor, 1);
  assert.equal(result.garagemValor, 0);
  assert.equal(result.elevadorValor, null);
  assert.equal(result.codigoBase, "1");
  assert.equal(result.linkReal, "https://www.gbnimob.com.br/imovel/loja-em-uba-1/1");
  assert.equal(result.linkCard, result.linkReal);
  assert.equal(result.dataInclusao, now);
  assert.equal(result.atualizadoEm, now);
  assert.equal(result.dataExclusao, "");
  assert.equal(result.corretor, "GB");
});

test("parser de aluguel, consulta e zero sao distintos de campos desconhecidos", () => {
  assert.equal(parseImovelGb(record(1, { finalidade: "Aluguel", valor: "R$ 1.500,00" }), "locacao").preco, 1500);
  for (const valor of ["Sob consulta", "Consulte"]) assert.equal(parseImovelGb(record(1, { valor }), "venda").preco, null);
  assert.equal(parseImovelGb(record(1, { valor: "R$ 0,00" }), "venda").preco, 0);
  assert.equal(parseImovelGb(record(1, { numeroquartos: null, numerovagas: "" }), "venda").dormitorioValor, null);
  assert.equal(parseImovelGb(record(1, { numero: "105A" }), "venda").localizacao, "Rua Dico Teixeira, 105A, DICO TEIXEIRA, Ub\u00e1, MG");
});

test("area usa interna, principal, lote; bairros e cidades nao sao presumidos como Uba", () => {
  assert.equal(parseImovelGb(record(1, { areainterna: "0,00" }), "venda").areaValor, 160);
  assert.equal(parseImovelGb(record(1, { areainterna: "", areaprincipal: "0", arealote: "6.000,50" }), "venda").areaValor, 6000.5);
  assert.equal(parseImovelGb(record(1, { areainterna: null, areaprincipal: null, arealote: null }), "venda").areaValor, null);
  assert.equal(parseImovelGb(record(1, { areainterna: "0", areaprincipal: "0", arealote: "0" }), "venda").areaValor, 0);
  for (const [cidade, expected] of [["Juiz de Fora", "juiz-de-fora-mg"], ["Campestre", "campestre-mg"]]) {
    assert.equal(parseImovelGb(record(1, { cidade }), "venda").cidade, expected);
  }
  assert.equal(parseImovelGb(record(1, { bairro: "Novo Centro - Rural" }), "venda").bairro, "novo-centro-rural");
});

test("tipos reais usam catalogo, inclusive areas comerciais e lote em condominio", () => {
  for (const [tipo, expected] of [
    ["Loja", "loja"], ["Apartamento", "apartamento"], ["Lote", "terreno"],
    ["Lote em condom\u00ednio", "terreno"], ["Cobertura", "cobertura"], ["Galp\u00e3o", "galpao"],
    ["Casa", "casa"], ["Ch\u00e1cara", "granja"], ["\u00c1rea privativa", "terreno"],
    ["S\u00edtio", "granja"], ["Fazenda", "area-rural"], ["Flat", "flat"], ["Pr\u00e9dio", "predio"], ["Sala", "sala"],
  ]) assert.equal(parseImovelGb(record(1, { tipo }), "venda").tipoImovel, expected);
});

test("campos invalidos interrompem em vez de produzir registros parciais", () => {
  for (const overrides of [
    { finalidade: "Aluguel" }, { codigo: "0" }, { codigo: "abc" },
    { url_amigavel: "../externo" }, { url_amigavel: "x?pagina=1" }, { titulo: "" },
    { valor: "" }, { valor: "R$ 1,2" }, { valor: "R$ 1.23" }, { valor: "R$ 1,234" },
    { bairro: "" }, { cidade: "Cidade inexistente" }, { estado: "AL" },
    { tipo: "Desconhecido" }, { numeroquartos: "-1" }, { numerovagas: "1,5" },
    { numerosalas: "erro" }, { areainterna: "120.50" }, { tipomedida: "ha" },
    { urlfotoprincipalp: "javascript:alert(1)" },
  ]) assert.throws(() => parseImovelGb(record(1, overrides), "venda"));
  assert.throws(() => parseImovelGb(null, "venda"), /finalidade/);
  assert.throws(() => parseImovelGb(record(), "outro"), /invalida/);
});

test("rotas exigem origem, pagina, finalidade e ausencia de filtros extras", () => {
  validarUrlGb(project.urlVendas, "venda");
  validarUrlGb(project.urlLocacao, "locacao");
  validarUrlGb(project.urlVendas.replace("pagina=1", "pagina=5"), "venda", 5);
  for (const value of [
    project.urlLocacao, project.urlVendas.replace("www.", ""), project.urlVendas.replace("pagina=1", "pagina=2"),
    `${project.urlVendas}&tipo=loja`, `${project.urlVendas}#secao`, "https://www.gbnimob.com.br/venda/",
  ]) assert.throws(() => validarUrlGb(value, "venda"), /fora da finalidade/);
});

test("contador valida pagina inteira e ultima pagina sem depender do DOM", () => {
  assert.equal(lerPaginaGb(batch(100, records(20)), "venda").total, 100);
  assert.equal(lerPaginaGb(batch(21, [record(21)]), "venda", 2).imoveis.length, 1);
  assert.equal(lerPaginaGb(batch(16, records(16, 0, { finalidade: "Aluguel" })), "locacao").total, 16);
  assert.equal(lerPaginaGb(batch(0, []), "venda").total, 0);
  for (const data of [null, batch("20", records(20)), batch(-1, []), batch(21, []), batch(2, [record()]), batch(1, [{ finalidade: "Aluguel" }])]) {
    assert.throws(() => lerPaginaGb(data, "venda"));
  }
  assert.throws(() => lerPaginaGb(batch(1, []), "venda", 2), /intervalo/);
});

test("paginacao completa usa formulario oficial, valida inicio/fim e conserva datas", async () => {
  const first = batch(21, records(20));
  const last = batch(21, [record(21)]);
  const f = fixture([first, last, first]);
  const counts = [];
  const old = { dataInclusao: "2020-01-01", elevadorValor: 2, dormitorioValor: 4 };
  const result = await coletarGb(f.browser, project, "venda", {
    anteriores: new Map([[parseImovelGb(record(), "venda").linkReal, old]]),
    onCount: async total => counts.push(total),
  });
  assert.equal(result.imoveis.length, 21);
  assert.equal(result.totalEsperado, 21);
  assert.equal(new Set(result.imoveis.map(item => item.codigoBase)).size, 21);
  assert.deepEqual(f.requests, ["2", "1"]);
  assert.deepEqual(counts, [21]);
  assert.equal(f.closed(), 1);
  assert.equal(result.imoveis[0].dataInclusao, "2020-01-01");
  assert.equal(result.imoveis[0].elevadorValor, 2);
  assert.equal(result.imoveis[0].dormitorioValor, 0);
});

test("aluguel e check coletam todos os registros e nao visitam detalhes", async () => {
  const first = batch(21, records(20, 0, { finalidade: "Aluguel" }));
  const last = batch(21, [record(21, { finalidade: "Aluguel" })]);
  const f = fixture([first, last, first], { negociacao: "locacao" });
  const result = await coletarGb(f.browser, project, "locacao", { enriquecer: false });
  assert.equal(result.imoveis.length, 21);
  assert.deepEqual(f.requests, ["2", "1"]);
});

test("duplicacoes, total alterado, pagina incompleta e primeira pagina instavel rejeitam retorno", async () => {
  const first = batch(21, records(20));
  for (const batches of [
    [first, batch(21, [record(1)])],
    [first, batch(22, records(2, 20))],
    [first, batch(21, [])],
    [first, batch(21, [record(21)]), batch(21, records(20, 1))],
    [batch(2, [record(), record()])],
  ]) {
    const f = fixture(batches);
    await assert.rejects(coletarGb(f.browser, project, "venda"), /preservados/);
    assert.equal(f.closed(), 1);
  }
});

test("HTTP, filtro inesperado, redirect, erro de API e zero preservam base e fecham pagina", async () => {
  const first = batch(1, [record()]);
  for (const [batches, options, expected] of [
    [[first], { navigationOk: false }, /Listagem HTTP 500/],
    [[first], { apiOk: false }, /API HTTP 403/],
    [[first], { url: project.urlLocacao }, /fora da finalidade/],
    [[first], { body: "finalidade=venda&numeropagina=1&numeroregistros=20&codigocidade=2" }, /filtro inesperado/],
    [[first], { failure: "API indisponivel" }, /API indisponivel/],
    [[batch(0, []), batch(0, [])], {}, /vazia requer confirmacao/],
  ]) {
    const f = fixture(batches, options);
    await assert.rejects(coletarGb(f.browser, project, "venda"), expected);
    assert.equal(f.closed(), 1);
  }
});
