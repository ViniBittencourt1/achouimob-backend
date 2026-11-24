import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { buildUrlRealiza, parseImovelRealiza, isRealizaListingResponse, extractRealizaSales, fetchRealizaPage } from "./extractor.js";
import { project } from "./config.js";
import { projetoContagemVendas } from "../../_utils/vendasContagemProjetos.js";
import { validarUrlContagemVendas, lerContagemVendasDOM } from "../../_utils/vendasContagem.js";
import { arquivoPrincipalVendas, reconciliarVendas } from "../../_utils/vendasSincronizacao.js";
import { consolidateData } from "../parser.js";
import order from "../../../../../crawler-order.cjs";

const item = (codigo = 1, changes = {}) => ({
  codigo, finalidade: "Venda", titulo: "Apartamento a venda em Icarai",
  url_amigavel: "apartamento-a-venda-em-icarai", valor: "R$ 550.000,75",
  bairro: "Icaraí", cidade: "Niterói", estado: "RJ", tipo: "Apartamento",
  endereco: "Rua Teste", numero: "***", numeroquartos: "3", numerobanhos: "2",
  numerosuites: "1", numerosalas: "1", numerovagas: "4",
  areainterna: "96,16", areaprincipal: "125,00", arealote: "6.500,00", tipomedida: "m²",
  urlfotoprincipalp: "https://cdn.imoview.com.br/realizaii/foto.jpg", ...changes,
});

test("cadastro integra script, painel, ordem, JSON e contagem exclusiva de vendas", () => {
  const backendRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
  const pkg = JSON.parse(fs.readFileSync(path.join(backendRoot, "package.json")));
  assert.ok(pkg.scripts.nitrealiza.endsWith("/niteroi/nitRealiza/index.js"));
  assert.ok(order.ORDEM_PROJETOS.includes(project.collection));
  assert.equal(arquivoPrincipalVendas("nitRealiza.json"), true);
  const source = fs.readFileSync(new URL("../../_1Jf/jfora.js", import.meta.url), "utf8");
  const fn = source.slice(source.indexOf("function getCollectionNameForScript("), source.indexOf("\nfunction loadConfig("));
  const context = vm.createContext({ fs, path, backendRoot, extractJforaScripts: () => Object.entries(pkg.scripts).map(([name, cmd]) => ({ name, cmd })) });
  vm.runInContext(fn, context);
  assert.equal(vm.runInContext('getCollectionNameForScript("nitrealiza")', context), project.collection);
  const config = projetoContagemVendas(project.collection);
  validarUrlContagemVendas(config, buildUrlRealiza(2));
  for (const url of [project.url.replace("/venda/", "/aluguel/"), project.url.replace("www.realizaimoveisrj.com.br", "outro.example")]) {
    assert.throws(() => validarUrlContagemVendas(config, url));
  }
  assert.throws(() => buildUrlRealiza(0));
  assert.equal(new URL(buildUrlRealiza(58)).searchParams.get("pagina"), "58");
});

test("contador aguarda total renderizado em vez de assumir quantidade de cards", () => {
  const config = projetoContagemVendas(project.collection);
  const dom = new JSDOM("<h1 class='texto-topo-busca'>Imoveis à venda em São Gonçalo e Região</h1>");
  const previous = globalThis.document;
  globalThis.document = dom.window.document;
  try {
    assert.equal(lerContagemVendasDOM(config), false);
    document.querySelector("h1").textContent = "1.141 Imóveis à venda em São Gonçalo e Região";
    assert.match(lerContagemVendasDOM(config).label, /1.141/);
    document.querySelector("h1").textContent = "1 Imóvel à venda em São Gonçalo e Região";
    assert.ok(lerContagemVendasDOM(config));
    document.querySelector("h1").textContent = "1141 Imóveis para alugar";
    assert.equal(lerContagemVendasDOM(config), false);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
    dom.window.close();
  }
});

test("20 campos, catalogos, centavos, area util, banheiros e vagas estruturados", () => {
  const record = parseImovelRealiza(item());
  assert.equal(Object.keys(record).length, 20);
  assert.equal(record.preco, 550000.75);
  assert.equal(record.areaValor, 96.16);
  assert.equal(record.bairro, "icarai");
  assert.equal(record.cidade, "niteroi-rj");
  assert.equal(record.tipoImovel, "apartamento");
  assert.equal(record.dormitorioValor, 3);
  assert.equal(record.banheiroValor, 2);
  assert.equal(record.garagemValor, 4);
  assert.equal(record.ambienteValor, 1);
  assert.equal(record.codigoBase, "1");
  assert.equal(record.localizacao, "Rua Teste, Icaraí, Niterói, RJ");
  assert.equal(record.linkReal, "https://www.realizaimoveisrj.com.br/imovel/apartamento-a-venda-em-icarai/1");
  assert.equal(parseImovelRealiza(item(2, { areainterna: "0" })).areaValor, 125);
  assert.equal(parseImovelRealiza(item(2, { areainterna: "", areaprincipal: "0" })).areaValor, 6500);
  assert.equal(parseImovelRealiza(item(2, { valor: "Sob consulta" })).preco, null);
});

test("tipo composto fora do catalogo usa o maior prefixo reconhecido", () => {
  for (const [tipo, esperado] of [["Casa duplex", "casa"], ["Casa Triplex", "casa"], ["Apartamento", "apartamento"]]) {
    assert.equal(parseImovelRealiza(item(3, { tipo })).tipoImovel, esperado);
  }
});

test("falha explicita em aluguel, identidade, preco, numeros, area ou foto invalidos", () => {
  for (const changes of [
    { finalidade: "Aluguel" }, { codigo: "" }, { titulo: "" }, { url_amigavel: "../teste" },
    { valor: "" }, { valor: "erro" }, { areainterna: "96.16" }, { tipomedida: "ha" },
    { numerovagas: "-1" }, { urlfotoprincipalp: "javascript:alert(1)" },
  ]) assert.throws(() => parseImovelRealiza(item(1, changes)));
});

test("localizacao desconhecida fica com aviso sem presumir Niteroi nem usar bairro alternativo", () => {
  const warn = console.warn;
  const warnings = [];
  console.warn = message => warnings.push(message);
  try {
    const record = parseImovelRealiza(item(1, { cidade: "Cidade X", bairro: "Bairro X", bairro2: "Icarai" }));
    assert.equal(record.cidade, "Cidade X");
    assert.equal(record.bairro, "Bairro X");
    assert.equal(warnings.length, 2);
  } finally { console.warn = warn; }
});

function listingResponse({ finalidade = "venda", page = 1, size = 20, url = "https://www.realizaimoveisrj.com.br/retornar-imoveis-disponiveis", method = "POST" } = {}) {
  return {
    url: () => url, ok: () => true,
    request: () => ({ method: () => method, postData: () => new URLSearchParams({ finalidade, numeropagina: page, numeroregistros: size }).toString() }),
  };
}

test("resposta deve corresponder ao endpoint, origem, finalidade, pagina e tamanho", () => {
  assert.equal(isRealizaListingResponse(listingResponse(), 1), true);
  for (const options of [
    { finalidade: "aluguel" }, { page: 2 }, { size: 10 }, { method: "OPTIONS" },
    { url: "https://outro.example/retornar-imoveis-disponiveis" },
  ]) assert.equal(isRealizaListingResponse(listingResponse(options), 1), false);
});

test("consulta publica envia formulario com prazo e falha explicitamente em HTTP ou JSON invalido", async () => {
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = async (endpoint, options) => {
      assert.equal(endpoint, "https://www.realizaimoveisrj.com.br/retornar-imoveis-disponiveis");
      assert.equal(options.method, "POST");
      assert.equal(options.headers["Content-Type"], "application/x-www-form-urlencoded; charset=UTF-8");
      assert.equal(options.body, "finalidade=venda&numeropagina=2");
      assert.ok(options.signal instanceof AbortSignal);
      return { ok: true, json: async () => ({ quantidade: 21, lista: [item(21)] }) };
    };
    const result = await fetchRealizaPage(listingResponse().url(), "finalidade=venda&numeropagina=2");
    assert.equal(result.lista[0].codigo, 21);
    globalThis.fetch = async () => ({ ok: false, status: 403 });
    await assert.rejects(fetchRealizaPage(listingResponse().url(), ""), /API HTTP 403/);
    globalThis.fetch = async () => ({ ok: true, json: async () => { throw new SyntaxError("JSON invalido"); } });
    await assert.rejects(fetchRealizaPage(listingResponse().url(), ""), /JSON invalido/);
  } finally { globalThis.fetch = previous; }
});

function fakeBrowser(data, { status = 200, redirected = false } = {}) {
  let closed = 0;
  let calls = 0;
  const browser = { newPage: async () => ({
    goto: async () => ({ ok: () => status === 200, status: () => status }),
    url: () => redirected ? project.url.replace("/venda/", "/aluguel/") : project.url,
    waitForResponse: async predicate => {
      const response = listingResponse();
      assert.equal(predicate(response), true);
      return response;
    },
    evaluate: async (callback, endpoint, body) => {
      assert.equal(callback, fetchRealizaPage);
      assert.ok(endpoint.endsWith("/retornar-imoveis-disponiveis"));
      const params = new URLSearchParams(body);
      assert.equal(params.get("finalidade"), "venda");
      assert.equal(params.get("numeropagina"), String(++calls));
      return data[calls - 1];
    },
    close: async () => closed++,
  }) };
  return { browser, closed: () => closed, calls: () => calls };
}

test("coleta todas as paginas e parcial final; reconciliacao preserva formato", async () => {
  const first = Array.from({ length: 20 }, (_, i) => item(i + 1));
  const fake = fakeBrowser([{ quantidade: 21, lista: first }, { quantidade: 21, lista: [item(21)] }]);
  const records = await extractRealizaSales(fake.browser, { totalEsperado: 21 });
  assert.equal(records.length, 21);
  assert.equal(fake.closed(), 1);
  const consolidated = consolidateData(records, new Map());
  const result = reconciliarVendas(records, [], consolidated, project.collection, { totalEsperado: 21, codigoRepetidoPorLink: true });
  assert.equal(result.ativos.length, 21);
});

test("check simples percorre so primeiro lote e vazio exige total explicito", async () => {
  const fake = fakeBrowser([{ quantidade: 21, lista: Array.from({ length: 20 }, (_, i) => item(i + 1)) }]);
  assert.equal((await extractRealizaSales(fake.browser, { totalEsperado: 21, somentePrimeiraPagina: true })).length, 20);
  assert.equal(fake.calls(), 1);
  const empty = fakeBrowser([{ quantidade: 0, lista: [] }]);
  assert.deepEqual(await extractRealizaSales(empty.browser, { totalEsperado: 0 }), []);
  await assert.rejects(extractRealizaSales(empty.browser), /Precontagem/);
});

test("total alterado, pagina incompleta, repeticao, aluguel e HTTP impedem coleta", async () => {
  const first = Array.from({ length: 20 }, (_, i) => item(i + 1));
  for (const [data, options] of [
    [[{ quantidade: 22, lista: first }]],
    [[null]],
    [[{ quantidade: 21, lista: first.slice(1) }]],
    [[{ quantidade: 21, lista: first }, { quantidade: 21, lista: [item(1)] }]],
    [[{ quantidade: 21, lista: first }, { quantidade: 21, lista: [item(21, { finalidade: "Aluguel" })] }]],
    [[], { status: 403 }], [[], { redirected: true }],
  ]) {
    const fake = fakeBrowser(data, options);
    await assert.rejects(extractRealizaSales(fake.browser, { totalEsperado: 21 }));
    assert.equal(fake.closed(), 1);
  }
});
