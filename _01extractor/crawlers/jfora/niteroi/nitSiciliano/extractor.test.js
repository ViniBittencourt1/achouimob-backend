import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { parseCardSiciliano, lerListagemSiciliano, extractSicilianoSales } from "./extractor.js";
import { project } from "./config.js";
import { projetoContagemVendas } from "../../_utils/vendasContagemProjetos.js";
import { parseTotalVendas, validarUrlContagemVendas } from "../../_utils/vendasContagem.js";
import order from "../../../../../crawler-order.cjs";
import { arquivoPrincipalVendas, reconciliarVendas } from "../../_utils/vendasSincronizacao.js";
import { consolidateData } from "../parser.js";

const card = (id = 1) => `<div class="LI_Imovel" id="${id}"><div class="salePurposeClass">
  <div class="ImageSide"><a href="/apartamento-${id}"><img src="https://img.apresenta.me/foto.jpg"></a>
    <span class="ImovelId"><span class="id">REF${id}</span></span>
    <h5 class="ImovelValor"><span class="value"><span>R$</span> 550.000,75</span><span>Valor de Venda</span></h5>
    <h5 class="buildingCondominiumValue"><span class="value">744</span></h5></div>
  <a class="Title" href="/apartamento-${id}">Apartamento em Icarai</a><span class="SubCategoria">Apartamento</span>
  <span class="Endereco"><span class="Rua">Rua Teste</span><span class="Numero">10</span>
    <span class="Bairro">Icaraí</span><span class="cidade">Niterói</span><span class="Estado">Rio de Janeiro</span></span>
  <span class="ResumoItem BEDROOM"><span class="val">3</span></span>
  <span class="ResumoItem BATHROOM"><span class="val">2</span></span>
  <span class="ResumoItem ROOM"><span class="val">1</span></span>
  <span class="ResumoItem SUITE"><span class="val">1</span></span>
  <span class="ResumoItem GARAGE"><span class="val">2</span></span>
  <span class="ResumoItem AREA_TOTAL"><span class="val">80.00m²</span></span>
  <span class="ResumoItem AREA_USEFUL"><span class="val">55.25m²</span></span>
  <div class="groupDetails"><span class="Elevador">Elevador</span></div></div></div>`;

test("cadastro integra script, painel, ordem e contagem exclusiva de vendas", () => {
  const backendRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
  const pkg = JSON.parse(fs.readFileSync(path.join(backendRoot, "package.json")));
  assert.ok(pkg.scripts.nitsiciliano.endsWith("/niteroi/nitSiciliano/index.js"));
  assert.ok(order.ORDEM_PROJETOS.includes(project.collection));
  assert.equal(arquivoPrincipalVendas("nitSiciliano.json"), true);
  const source = fs.readFileSync(new URL("../../_1Jf/jfora.js", import.meta.url), "utf8");
  const fn = source.slice(source.indexOf("function getCollectionNameForScript("), source.indexOf("\nfunction loadConfig("));
  const context = vm.createContext({ fs, path, backendRoot, extractJforaScripts: () => Object.entries(pkg.scripts).map(([name, cmd]) => ({ name, cmd })) });
  vm.runInContext(fn, context);
  assert.equal(vm.runInContext('getCollectionNameForScript("nitsiciliano")', context), project.collection);
  const config = projetoContagemVendas(project.collection);
  assert.equal(parseTotalVendas("62 Imóveis à venda encontrados", config), 62);
  validarUrlContagemVendas(config, project.url);
  assert.throws(() => validarUrlContagemVendas(config, project.url.replace("venda", "aluguel")));
  assert.throws(() => validarUrlContagemVendas(config, "https://outro.example/imoveis/venda"));
});

test("card extrai os 20 campos, preco de venda e area util decimal sem confundir taxas ou suites", () => {
  const record = parseCardSiciliano(card());
  assert.equal(Object.keys(record).length, 20);
  assert.equal(record.preco, 550000.75);
  assert.equal(record.areaValor, 55.25);
  assert.equal(record.banheiroValor, 2);
  assert.equal(record.dormitorioValor, 3);
  assert.equal(record.garagemValor, 2);
  assert.equal(record.ambienteValor, 1);
  assert.equal(record.elevadorValor, 1);
  assert.equal(record.cidade, "niteroi-rj");
  assert.equal(record.bairro, "icarai");
  assert.equal(record.tipoImovel, "apartamento");
  assert.equal(record.codigoBase, "REF1");
  assert.equal(record.linkFoto, "https://img.apresenta.me/foto.jpg");
  assert.match(record.localizacao, /Rua Teste, 10/);
});

test("categoria composta usa o tipo do inicio do titulo", () => {
  const comTipo = (titulo, tipo) => parseCardSiciliano(card().replace("Apartamento em Icarai", titulo)
    .replace('<span class="SubCategoria">Apartamento</span>', `<span class="SubCategoria">${tipo}</span>`)).tipoImovel;
  assert.equal(comTipo("Cobertura Studio 55m²", "Flat/Loft/Estúdio"), "cobertura");
  assert.equal(comTipo("Flat na Boa Viagem com vaga de garagem", "Flat/Loft/Estúdio"), "flat");
  assert.equal(comTipo("Casa duplex em Icarai", "Casa duplex"), "casa");
});

test("dados passam pela reconciliacao de vendas preservando inclusao e retirando ausentes", () => {
  const current = parseCardSiciliano(card());
  const old = { ...current, dataInclusao: "2026-01-01" };
  const absent = parseCardSiciliano(card(2));
  const previous = [old, absent];
  const consolidated = consolidateData([current], new Map(previous.map(item => [item.linkReal, item])));
  const result = reconciliarVendas([current], previous, consolidated, project.collection, { totalEsperado: 1, codigoRepetidoPorLink: true });
  assert.equal(result.ativos.length, 1);
  assert.equal(result.ativos[0].dataInclusao, "2026-01-01");
  assert.equal(result.retirados.length, 1);
  assert.equal(result.retirados[0].linkReal, absent.linkReal);
  assert.throws(() => reconciliarVendas([current], previous, consolidated, project.collection, { totalEsperado: 2 }), /incompleta/);
});

test("faixas usam minimo com aviso e area total e fallback apenas sem util", () => {
  const warnings = [];
  const warn = console.warn;
  console.warn = message => warnings.push(message);
  try {
    const record = parseCardSiciliano(card().replace(">2</span></span>", ">1 ~ 2</span></span>")
      .replace('<span class="ResumoItem AREA_USEFUL"><span class="val">55.25m²</span></span>', ""));
    assert.equal(record.banheiroValor, 1);
    assert.equal(record.areaValor, 80);
    assert.ok(warnings.some(message => message.includes("usando minimo")));
    assert.throws(() => parseCardSiciliano(card().replace("55.25m²", "90.00 ~ 20.00m²")), /Faixa invertida/);
  } finally { console.warn = warn; }
});

test("rejeita cards de aluguel, outra origem, preco invalido e referencia ausente", () => {
  for (const html of [
    card().replace("salePurposeClass", "rentPurposeClass"),
    card().replaceAll('href="/apartamento-', 'href="https://outro.example/apartamento-'),
    card().replace("550.000,75", "erro"),
    card().replace("Valor de Venda", "Valor de Aluguel"),
    card().replace("REF1", ""),
  ]) assert.throws(() => parseCardSiciliano(html));
});

test("localizacao ausente nao presume Niteroi e preserva pendencia com aviso", () => {
  const warn = console.warn;
  const warnings = [];
  console.warn = message => warnings.push(message);
  try {
    const record = parseCardSiciliano(card().replace(">Niterói<", "><"));
    assert.equal(record.cidade, "");
    assert.equal(record.bairro, "Icaraí");
    assert.ok(warnings.some(message => message.includes("Cidade sem correspondencia")));
  } finally { console.warn = warn; }
});

const snapshot = (cards, total = 2, hasMore = true) => ({ cards, label: `${total} Imóveis à venda encontrados`, hasMore });
function fakeBrowser(snapshots, status = 200) {
  let index = 0;
  let closed = 0;
  const page = {
    goto: async () => ({ ok: () => status === 200, status: () => status }),
    url: () => project.url,
    evaluate: async () => snapshots[index],
    click: async () => { index++; },
    waitForFunction: async () => {},
    close: async () => { closed++; },
  };
  return { browser: { newPage: async () => page }, closed: () => closed };
}

test("carregar mais une lotes e so retorna a quantidade exata", async () => {
  const fake = fakeBrowser([snapshot([card()]), snapshot([card(), card(2)], 2, false)]);
  assert.equal((await extractSicilianoSales(fake.browser, { totalEsperado: 2 })).length, 2);
  assert.equal(fake.closed(), 1);
});

test("coleta incompleta, repetida, acima do total e contador alterado preservam base", async () => {
  for (const snapshots of [
    [snapshot([card()], 2, false)],
    [snapshot([card()]), snapshot([card(), card()], 2, false)],
    [snapshot([card(), card(2), card(3)])],
    [snapshot([card()], 3)],
    [snapshot([], 2)],
  ]) {
    const fake = fakeBrowser(snapshots);
    await assert.rejects(extractSicilianoSales(fake.browser, { totalEsperado: 2 }), /base preservada/);
    assert.equal(fake.closed(), 1);
  }
  const blocked = fakeBrowser([], 403);
  await assert.rejects(extractSicilianoSales(blocked.browser, { totalEsperado: 2 }), /HTTP 403/);
  assert.equal(blocked.closed(), 1);
});

test("check permite primeiro lote e vazio exige contador zero", async () => {
  const fake = fakeBrowser([snapshot([card()])]);
  assert.equal((await extractSicilianoSales(fake.browser, { totalEsperado: 2, somentePrimeiraPagina: true })).length, 1);
  const empty = fakeBrowser([snapshot([], 0, false)]);
  assert.deepEqual(await extractSicilianoSales(empty.browser, { totalEsperado: 0 }), []);
  await assert.rejects(extractSicilianoSales(empty.browser, {}), /Precontagem/);
});

test("leitor DOM so considera cards da listagem e detecta carregar mais", () => {
  const dom = new JSDOM(`<h1>2 Imóveis à venda encontrados</h1>${card(99)}<div class="BuscaResultado">${card()}<button class="BtnShowMoreImovel"></button></div>`);
  const previous = globalThis.document;
  globalThis.document = dom.window.document;
  try {
    const result = lerListagemSiciliano();
    assert.equal(result.cards.length, 1);
    assert.equal(result.hasMore, true);
    assert.equal(result.label, "2 Imóveis à venda encontrados");
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
    dom.window.close();
  }
});
