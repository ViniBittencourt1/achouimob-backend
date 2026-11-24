import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { buildUrlDrin, parseCardDrin, lerListagemDrin, extractDrinSales, resolverTipoDrin } from "./extractor.js";
import { project } from "./config.js";
import { projetoContagemVendas } from "../../_utils/vendasContagemProjetos.js";
import { parseTotalVendas, validarUrlContagemVendas, lerContagemVendasDOM } from "../../_utils/vendasContagem.js";
import { arquivoPrincipalVendas, reconciliarVendas } from "../../_utils/vendasSincronizacao.js";
import { consolidateData } from "../parser.js";
import order from "../../../../../crawler-order.cjs";

const card = (id = 1) => `<div class="box-imovel ng-scope"><a href="/imovel/apartamento-a-venda/REF${id}">
  <h2 class="pagina-titulo">Apartamento em Icarai<span class="detalhe-localizacao">
    <f ng-if="imovel.localizacao.length > 0">Rua Teste - Icaraí, Niterói - RJ</f><b>Imperdível</b></span></h2></a>
  <a class="resultado-imovel-img" href="/imovel/apartamento-a-venda/REF${id}"><img data-flickity-lazyload="https://fotosmd.sitemidas.com.br/foto.jpg"></a>
  <ul><li><span class="icons-codigo"></span>Código: <strong>REF${id}</strong></li>
  <li><i class="fa-home"></i>Apartamento</li>
  <li ng-if="imovel.dormitorios > 0"><strong>3</strong> dormitorios sendo <strong>1</strong> suite</li>
  <li ng-if="imovel.banheiros > 0"><strong>2</strong> banheiros ao total</li>
  <li ng-if="imovel.garagem > 0"><strong>4</strong> vagas</li>
  <li ng-if="imovel.areaUtil > 0">Area util <strong>96,16 m²</strong></li>
  <li ng-if="imovel.areaTotal > 0">Area total <strong>1.250 m²</strong></li>
  <li ng-if="imovel.areaTerreno > 0">Area terreno <strong>6.500 m²</strong></li>
  <li><span class="descricao-transacao">Aluguel</span><strong class="valor-transacao">R$ 1.000,00</strong></li>
  <li ng-if="imovel.valorVenda != null"><span class="descricao-transacao">Venda</span><strong class="valor-transacao">R$ 550.000,75</strong></li>
  <li><span class="descricao-transacao">Condomínio</span><strong class="valor-transacao">R$ 300,00</strong></li></ul></div>`;

function withDocument(html, callback) {
  const dom = new JSDOM(html);
  const previous = globalThis.document;
  globalThis.document = dom.window.document;
  try { return callback(); } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
    dom.window.close();
  }
}

test("cadastro integra script, painel, ordem, JSON e contagem de vendas", () => {
  const backendRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
  const pkg = JSON.parse(fs.readFileSync(path.join(backendRoot, "package.json")));
  assert.ok(pkg.scripts.nitdrin.endsWith("/niteroi/nitDrin/index.js"));
  assert.ok(order.ORDEM_PROJETOS.includes(project.collection));
  assert.equal(arquivoPrincipalVendas("nitDrin.json"), true);
  const source = fs.readFileSync(new URL("../../_1Jf/jfora.js", import.meta.url), "utf8");
  const fn = source.slice(source.indexOf("function getCollectionNameForScript("), source.indexOf("\nfunction loadConfig("));
  const context = vm.createContext({ fs, path, backendRoot, extractJforaScripts: () => Object.entries(pkg.scripts).map(([name, cmd]) => ({ name, cmd })) });
  vm.runInContext(fn, context);
  assert.equal(vm.runInContext('getCollectionNameForScript("nitdrin")', context), project.collection);
  const config = projetoContagemVendas(project.collection);
  assert.equal(parseTotalVendas("Encontramos 61 resultados para sua busca", config), 61);
  validarUrlContagemVendas(config, buildUrlDrin(2));
  for (const url of [
    project.url.replace("VA,VL", "AA"),
    project.url.replace("/venda", "/aluguel"),
    project.url.replace("www.drinimoveis.com.br", "outro.example"),
  ]) assert.throws(() => validarUrlContagemVendas(config, url));
  assert.throws(() => buildUrlDrin(0));
  assert.equal(new URLSearchParams(new URL(buildUrlDrin(5)).hash.slice(3)).get("page"), "5");
});

test("card conserva 20 campos, centavos, area util e vagas, sem misturar suite ou taxas", () => {
  const record = parseCardDrin(card());
  assert.equal(Object.keys(record).length, 20);
  assert.equal(record.titulo, "Apartamento em Icarai");
  assert.equal(record.localizacao, "Rua Teste - Icaraí, Niterói - RJ");
  assert.equal(record.preco, 550000.75);
  assert.equal(record.areaValor, 96.16);
  assert.equal(record.dormitorioValor, 3);
  assert.equal(record.banheiroValor, 2);
  assert.equal(record.garagemValor, 4);
  assert.equal(record.bairro, "icarai");
  assert.equal(record.cidade, "niteroi-rj");
  assert.equal(record.tipoImovel, "apartamento");
  assert.equal(record.codigoBase, "REF1");
  assert.equal(record.linkFoto, "https://fotosmd.sitemidas.com.br/foto.jpg");
});

test("area total e terreno sao alternativas e nao perdem separador de milhar", () => {
  const semUtil = card().replace('<li ng-if="imovel.areaUtil > 0">Area util <strong>96,16 m²</strong></li>', "");
  assert.equal(parseCardDrin(semUtil).areaValor, 1250);
  assert.equal(parseCardDrin(semUtil.replace('<li ng-if="imovel.areaTotal > 0">Area total <strong>1.250 m²</strong></li>', "")).areaValor, 6500);
});

test("tipo usa o prefixo mais especifico do catalogo sem confundir qualificadores", () => {
  const original = parseCardDrin(card(), new Date("2026-10-16T12:00:00Z"));
  for (const [nome, slug] of [
    ["Sala Comercial", "sala"],
    ["Apartamento Com Área Privativa", "apartamento"],
    ["Apartamento Garden", "apartamento"],
    ["Casa Triplex", "casa"],
    ["Casa Duplex", "casa"],
    ["Casa Em Condomínio Duplex", "casa"],
    ["Terreno Comercial", "terreno"],
    ["Casa Comercial", "casa-comercial"],
    ["Cobertura Duplex", "cobertura"],
    ["Área Rural", "area-rural"],
    ["sala", "sala"],
  ]) {
    assert.equal(resolverTipoDrin(nome), slug);
    const html = card().replace('<i class="fa-home"></i>Apartamento', `<i class="fa-home"></i>${nome}`);
    assert.deepEqual(parseCardDrin(html, new Date("2026-10-16T12:00:00Z")), { ...original, tipoImovel: slug });
  }
  assert.equal(resolverTipoDrin("Outros"), "");
  assert.equal(resolverTipoDrin(""), "");
  const warnings = [];
  const warn = console.warn;
  console.warn = message => warnings.push(message);
  try {
    const html = card().replace('<i class="fa-home"></i>Apartamento', '<i class="fa-home"></i>Outros');
    assert.equal(parseCardDrin(html).tipoImovel, "Outros");
    assert.ok(warnings.some(message => message.includes("Tipo sem correspondencia unica")));
  } finally { console.warn = warn; }
});

test("preco sob consulta fica null e origem ou valores invalidos interrompem", () => {
  assert.equal(parseCardDrin(card().replace("R$ 550.000,75", "Consulte")).preco, null);
  for (const html of [
    card().replaceAll('href="/imovel/', 'href="https://outro.example/imovel/'),
    card().replace(">Venda<", ">Aluguel<"),
    card().replace("R$ 550.000,75", "R$ erro"),
    card().replace("96,16 m²", "96.16 m²"),
    card().replace("<strong>REF1</strong>", "<strong></strong>"),
  ]) assert.throws(() => parseCardDrin(html));
});

test("cidade e bairro desconhecidos ficam com aviso, sem presumir Niteroi", () => {
  const warn = console.warn;
  const warnings = [];
  console.warn = message => warnings.push(message);
  try {
    const record = parseCardDrin(card().replace("Rua Teste - Icaraí, Niterói - RJ", "Bairro X, Cidade X - RJ"));
    assert.equal(record.cidade, "Cidade X");
    assert.equal(record.bairro, "Bairro X");
    assert.ok(warnings.some(message => message.includes("Cidade sem correspondencia")));
  } finally { console.warn = warn; }
});

const counter = (total = 16) => `<h1 class="destaque-titulo">${total} Imóveis à Venda</h1><p>Encontramos <span class="bold ng-binding">${total}</span> resultados para sua busca</p>`;
test("DOM de contagem exige concordancia do titulo e contador e finalidade venda", () => {
  const config = projetoContagemVendas(project.collection);
  assert.ok(withDocument(counter(1) + card(), () => lerContagemVendasDOM(config)));
  assert.equal(withDocument(counter(1).replace("1 Imóveis", "2 Imóveis") + card(), () => lerContagemVendasDOM(config)), false);
  assert.equal(withDocument(counter(1).replace("à Venda", "para Alugar") + card(), () => lerContagemVendasDOM(config)), false);
  assert.ok(withDocument(counter(0), () => lerContagemVendasDOM(config)));
});

function fakeBrowser(pages, { status = 200, changedTotal, redirectPage } = {}) {
  let created = 0;
  let closed = 0;
  const destinations = [];
  const browser = {
    newPage: async () => {
      const index = created++;
      let destination;
      return {
        goto: async url => { destination = url; destinations.push(url); return { ok: () => status === 200, status: () => status }; },
        url: () => redirectPage ? buildUrlDrin(redirectPage) : destination,
        waitForFunction: async () => {},
        evaluate: async callback => callback.name === "lerContagemVendasDOM"
          ? { label: `Encontramos ${changedTotal ?? pages.flat().length} resultados para sua busca` }
          : pages[index],
        close: async () => { closed++; },
      };
    },
  };
  return { browser, closed: () => closed, destinations };
}
const firstPage = () => Array.from({ length: 15 }, (_, index) => card(index + 1));

test("paginacao coleta 15 por pagina e ultima parcial com total exato", async () => {
  const fake = fakeBrowser([firstPage(), [card(16)]]);
  const records = await extractDrinSales(fake.browser, { totalEsperado: 16 });
  assert.equal(records.length, 16);
  assert.equal(fake.closed(), 2);
  assert.deepEqual(fake.destinations, [buildUrlDrin(1), buildUrlDrin(2)]);
});

test("cards repetidos, pagina incompleta, contador alterado, HTTP e redirecionamento preservam base", async () => {
  for (const fake of [
    fakeBrowser([firstPage(), [card(1)]]),
    fakeBrowser([firstPage().slice(0, 14), [card(16)]], { changedTotal: 16 }),
    fakeBrowser([firstPage(), [card(16)]], { changedTotal: 17 }),
    fakeBrowser([firstPage(), [card(16)]], { status: 403 }),
    fakeBrowser([firstPage(), [card(16)]], { redirectPage: 2 }),
  ]) {
    await assert.rejects(extractDrinSales(fake.browser, { totalEsperado: 16 }), /base preservada/);
    assert.ok(fake.closed() >= 1);
  }
});

test("check permite primeira pagina e vazio exige total zero", async () => {
  const fake = fakeBrowser([firstPage(), [card(16)]]);
  assert.equal((await extractDrinSales(fake.browser, { totalEsperado: 16, somentePrimeiraPagina: true })).length, 15);
  const empty = fakeBrowser([[]]);
  assert.deepEqual(await extractDrinSales(empty.browser, { totalEsperado: 0 }), []);
  await assert.rejects(extractDrinSales(empty.browser), /Precontagem/);
});

test("leitura seleciona os cards e reconciliacao preserva inclusao e arquiva ausentes", () => {
  const html = withDocument(counter(1) + card(), lerListagemDrin);
  assert.equal(html.length, 1);
  const current = parseCardDrin(html[0]);
  const old = { ...current, dataInclusao: "2026-01-01" };
  const absent = parseCardDrin(card(2));
  const previous = [old, absent];
  const consolidated = consolidateData([current], new Map(previous.map(item => [item.linkReal, item])));
  const result = reconciliarVendas([current], previous, consolidated, project.collection, { totalEsperado: 1, codigoRepetidoPorLink: true });
  assert.equal(result.ativos[0].dataInclusao, "2026-01-01");
  assert.equal(result.retirados.length, 1);
  assert.equal(result.retirados[0].linkReal, absent.linkReal);
});
