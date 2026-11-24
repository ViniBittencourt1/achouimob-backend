import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { parseCardGustavo, lerListagemGustavo, temProximaPaginaGustavo, extractGustavoSales, validarPrecoSobConsultaGustavo } from "./extractor.js";
import { project } from "./config.js";
import { projetoContagemVendas } from "../../_utils/vendasContagemProjetos.js";
import { parseTotalVendas, validarUrlContagemVendas, lerContagemVendasDOM } from "../../_utils/vendasContagem.js";
import { arquivoPrincipalVendas, reconciliarVendas } from "../../_utils/vendasSincronizacao.js";
import { consolidateData } from "../parser.js";
import order from "../../../../../crawler-order.cjs";

const card = (id = 1) => `<article class="c49-property-card" id="property-${id}">
  <header><h2 class="c49-property-card_title">Apartamento em Icarai</h2>
    <span class="c49-property-card_type">Apartamento</span><span class="c49-property-card_code">Cód. ${id}</span>
    <div class="c49-property-card_address">Icaraí, Niterói - RJ</div></header>
  <div class="c49-property-card_photo"><a href="/${id}/imoveis/venda-apartamento-icarai-niteroi-rj">
    <img src="/foto.jpg" alt="#${id} - Apartamento para Venda em Niterói - RJ - 1"></a>
    <div class="c49-property-card_price">
      <div class="c49-property-card_rent-price"><span>R$</span> 415.000,75 <span>Venda</span></div>
      <div class="c49-property-card_other-prices">IPTU <b>185,00</b> Condominio <b>879,00</b></div>
    </div></div>
  <div class="c49-property-number-wrap" title="Area privativa"><span class="c49icon-area-1"></span><div class="c49-property-number">96.16 m²</div></div>
  <div class="c49-property-number-wrap" title="sendo 1 suite"><span class="c49icon-bedroom-1"></span><div class="c49-property-number">2 quartos</div></div>
  <div class="c49-property-number-wrap"><span class="c49icon-bathroom-1"></span><div class="c49-property-number">3 banh.</div></div>
  <div class="c49-property-number-wrap"><span class="c49icon-garage-1"></span><div class="c49-property-number">1 vaga</div></div>
</article>`;
const strip = (html, value) => html.replace("<header>", `<div class="c49-strip">${value}</div><header>`);
const noPrice = html => html.replace('<div class="c49-property-card_rent-price"><span>R$</span> 415.000,75 <span>Venda</span></div>', "");
const rental = id => card(id).replace("<span>Venda</span>", "<span>Locação</span>");

test("script integra painel, ordem, JSON publicavel e contagem exclusiva de vendas", () => {
  const backendRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
  const pkg = JSON.parse(fs.readFileSync(path.join(backendRoot, "package.json")));
  assert.ok(pkg.scripts.nitgustavo.endsWith("/niteroi/nitGustavo/index.js"));
  assert.ok(order.ORDEM_PROJETOS.includes(project.collection));
  assert.equal(arquivoPrincipalVendas("nitGustavo.json"), true);
  const source = fs.readFileSync(new URL("../../_1Jf/jfora.js", import.meta.url), "utf8");
  const fn = source.slice(source.indexOf("function getCollectionNameForScript("), source.indexOf("\nfunction loadConfig("));
  const context = vm.createContext({ fs, path, backendRoot, extractJforaScripts: () => Object.entries(pkg.scripts).map(([name, cmd]) => ({ name, cmd })) });
  vm.runInContext(fn, context);
  assert.equal(vm.runInContext('getCollectionNameForScript("nitgustavo")', context), project.collection);
  const config = projetoContagemVendas(project.collection);
  assert.equal(parseTotalVendas("2.021", config), 2021);
  validarUrlContagemVendas(config, project.url);
  validarUrlContagemVendas(config, `${project.url}/41`);
  for (const url of [
    project.url.replace("/venda/", "/locacao/"),
    project.url.replace("81668", "999"),
    project.url.replace("/81668", ""),
    `${project.url}/0`, `${project.url}/abc`,
    project.url.replace("www.corretorgustavoferreira.com.br", "outro.example"),
  ]) assert.throws(() => validarUrlContagemVendas(config, url));
});

test("card extrai 20 campos, conserva centavos e area decimal sem somar taxas ou suites", () => {
  const record = parseCardGustavo(card());
  assert.equal(Object.keys(record).length, 20);
  assert.equal(record.preco, 415000.75);
  assert.equal(record.areaValor, 96.16);
  assert.equal(record.bairro, "icarai");
  assert.equal(record.cidade, "niteroi-rj");
  assert.equal(record.tipoImovel, "apartamento");
  assert.equal(record.codigoBase, "1");
  assert.equal(record.dormitorioValor, 2);
  assert.equal(record.banheiroValor, 3);
  assert.equal(record.garagemValor, 1);
  assert.equal(record.linkFoto, "https://www.corretorgustavoferreira.com.br/foto.jpg");
  assert.equal(parseCardGustavo(card().replace("96.16 m²", "1.250,50 m²")).areaValor, 1250.5);
});

test("titulo vazio usa alt real da foto sem codigo nem numero da imagem", () => {
  const record = parseCardGustavo(card().replace(">Apartamento em Icarai<", "><"));
  assert.equal(record.titulo, "Apartamento para Venda em Niterói - RJ");
});

test("locacao, locados e vendidos sao classificados explicitamente, inclusive reservados para locacao", () => {
  for (const html of [rental(1), strip(noPrice(card()), "Locado"), strip(rental(1), "Reservado")]) {
    assert.throws(() => parseCardGustavo(html), error => error.code === "GUSTAVO_RENTAL_ONLY" && error.linkReal.endsWith("-niteroi-rj"));
  }
  assert.throws(() => parseCardGustavo(strip(card(), "Vendido")), { code: "GUSTAVO_SOLD" });
});

test("anuncio com ambas finalidades usa somente o preco de venda", () => {
  const html = card().replace('<div class="c49-property-card_price">', '<div class="c49-property-card_price"><div><span>R$</span> 1.300,00 <span>Locação</span></div>');
  assert.equal(parseCardGustavo(html).preco, 415000.75);
});

test("status sem preco conserva null com aviso e dados sem origem ou malformados falham", () => {
  const warnings = [];
  const warn = console.warn;
  console.warn = message => warnings.push(message);
  try {
    for (const status of ["Em avaliação", "Em negociação", "Reservado"]) {
      assert.equal(parseCardGustavo(strip(noPrice(card()), status)).preco, null);
    }
    assert.equal(warnings.filter(message => message.includes("Preco nao divulgado")).length, 3);
    assert.throws(() => parseCardGustavo(noPrice(card())), { code: "GUSTAVO_PRICE_DETAIL" });
    for (const html of [
      card().replaceAll('href="/1/', 'href="https://outro.example/1/'),
      card().replaceAll("/imoveis/venda-", "/imoveis/locacao-"),
      card().replace("415.000,75", "erro"),
      card().replace(">Cód. 1<", "><"),
      card().replace("96.16 m²", "area desconhecida"),
    ]) assert.throws(() => parseCardGustavo(html));
  } finally { console.warn = warn; }
});

const link = "https://www.corretorgustavoferreira.com.br/1/imoveis/venda-apartamento-icarai-niteroi-rj";
const detail = (functionName = "Sell", url = link, label = "Este imóvel está em avaliação") =>
  `<div class="c49-property-price-value">${label}</div><script type="application/ld+json">${JSON.stringify({
    "@graph": [{ "@type": "RealEstateListing", url, offers: { price: 999999, businessFunction: `http://purl.org/goodrelations/v1#${functionName}` } }],
  })}</script>`;

test("detalhe so confirma preco nao divulgado com mesmo anuncio, finalidade venda e mensagem reconhecida", () => {
  const warn = console.warn;
  const warnings = [];
  console.warn = message => warnings.push(message);
  try {
    validarPrecoSobConsultaGustavo(detail(), link);
    assert.equal(warnings.length, 1);
    assert.throws(() => validarPrecoSobConsultaGustavo(detail("LeaseOut"), link), /base preservada/);
    assert.throws(() => validarPrecoSobConsultaGustavo(detail("Sell", "https://outro.example"), link), /base preservada/);
    assert.throws(() => validarPrecoSobConsultaGustavo(detail("Sell", link, "Carregando"), link), /base preservada/);
  } finally { console.warn = warn; }
});

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

test("contador rejeita titulo misto ou aluguel mesmo com rota e numero de vendas", () => {
  const config = projetoContagemVendas(project.collection);
  for (const heading of ["Imóveis", "Imóveis para locação"]) {
    assert.equal(withDocument(`<span class="c49-filter-number">2021</span><h1 class="c49-filter-title">${heading}</h1>`,
      () => lerContagemVendasDOM(config)), false);
  }
  const result = withDocument('<span class="c49-filter-number">2021</span><h1 class="c49-filter-title">Imóveis à venda</h1>',
    () => lerContagemVendasDOM(config));
  assert.equal(result.label, "2021");
});

const next = (page = 2, searchId = "81668") => `javascript:pagination('35', '${page}', '${searchId}', '');`;
const snapshot = (cards, total = 2, pages = [next()]) => ({
  cards, label: String(total), heading: "Imóveis à venda", pages,
});
function fakeBrowser(snapshots, status = 200, detailHtml = detail()) {
  let calls = 0;
  let closed = 0;
  const destinations = [];
  const page = {
    goto: async url => { destinations.push(url); return { ok: () => status === 200, status: () => status }; },
    url: () => destinations.at(-1),
    evaluate: async () => snapshots[calls++],
    close: async () => { closed++; },
  };
  const detailPage = {
    goto: async () => ({ ok: () => status === 200 }),
    url: () => link, content: async () => detailHtml,
    close: async () => { closed++; },
  };
  let created = 0;
  return { browser: { newPage: async () => created++ ? detailPage : page }, closed: () => closed, destinations };
}

test("paginacao percorre todos os anuncios antes de descontar vendidos e locacoes", async () => {
  const fake = fakeBrowser([
    snapshot([card(), rental(2)], 4),
    snapshot([card(), strip(card(3), "Vendido"), strip(noPrice(card(4)), "Locado")], 4, []),
  ]);
  const result = await extractGustavoSales(fake.browser, { totalEsperado: 4 });
  assert.equal(result.imoveis.length, 1);
  assert.equal(result.excluidosLocacao.length, 2);
  assert.equal(result.excluidosVendidos.length, 1);
  assert.equal(new Set([...result.imoveis.map(item => item.linkReal), ...result.excluidosLocacao, ...result.excluidosVendidos]).size, 4);
  assert.deepEqual(fake.destinations, [`${project.url}/1`, `${project.url}/2`]);
  assert.equal(fake.closed(), 1);
});

test("paginacao reconhece URLs publicas e javascript legado somente da mesma busca e proxima pagina", () => {
  for (const href of [next(), `${project.url}/2`, "/imobiliaria/venda/imoveis/81668/2", `${project.url}/2/`]) {
    assert.equal(temProximaPaginaGustavo([href], project.url, 2), true, href);
  }
  for (const href of [
    null, "", next(3), next(2, "999"), project.url, `${project.url}/3`,
    `${project.url}/2?tipo=2`, `${project.url}/2#outra`,
    "/imobiliaria/locacao/imoveis/81668/2", "/imobiliaria/venda/imoveis/999/2",
    "https://outro.example/imobiliaria/venda/imoveis/81668/2", "http://[",
  ]) assert.equal(temProximaPaginaGustavo([href], project.url, 2), false, String(href));
});

test("coleta continua com href publico mesmo quando onclick contem javascript", async () => {
  const first = withDocument(`<span class="c49-filter-number">2</span><h1 class="c49-filter-title">Imóveis à venda</h1>
    <section id="c49mod-properties-list">${card()}</section>
    <ul class="pagination"><li><a href="/imobiliaria/venda/imoveis/81668/2"
      onclick="pagination('35', '2', '81668', '');return false;">2</a></li></ul>`, lerListagemGustavo);
  const fake = fakeBrowser([first, snapshot([card(2)], 2, [])]);
  const result = await extractGustavoSales(fake.browser, { totalEsperado: 2 });
  assert.equal(result.imoveis.length, 2);
  assert.deepEqual(fake.destinations, [`${project.url}/1`, `${project.url}/2`]);
  assert.equal(fake.closed(), 1);
});

test("sem preco no card exige detalhe verificavel e fecha ambas paginas", async () => {
  const fake = fakeBrowser([snapshot([noPrice(card())], 1)]);
  const result = await extractGustavoSales(fake.browser, { totalEsperado: 1 });
  assert.equal(result.imoveis[0].preco, null);
  assert.equal(fake.closed(), 2);
  const invalid = fakeBrowser([snapshot([noPrice(card())], 1)], 200, detail("LeaseOut"));
  await assert.rejects(extractGustavoSales(invalid.browser, { totalEsperado: 1 }), /base preservada/);
  assert.equal(invalid.closed(), 2);
});

test("falhas de completude e finalidade impedem retorno de uma base parcial", async () => {
  for (const snapshots of [
    [snapshot([card()], 2, [])],
    [snapshot([card()]), snapshot([card()], 2, [])],
    [snapshot([card(), card(2), card(3)])],
    [snapshot([card()], 3)],
    [snapshot([], 2)],
    [snapshot([card()], 2, [next(2, "999")])],
    [{ ...snapshot([card()]), heading: "Imóveis" }],
  ]) {
    const fake = fakeBrowser(snapshots);
    await assert.rejects(extractGustavoSales(fake.browser, { totalEsperado: 2 }), /base preservada/);
    assert.equal(fake.closed(), 1);
  }
  const blocked = fakeBrowser([], 403);
  await assert.rejects(extractGustavoSales(blocked.browser, { totalEsperado: 2 }), /HTTP 403/);
  assert.equal(blocked.closed(), 1);
});

test("check simples permite primeiro lote e vazio exige precontagem zero", async () => {
  const check = fakeBrowser([snapshot([card()])]);
  assert.equal((await extractGustavoSales(check.browser, { totalEsperado: 2, somentePrimeiraPagina: true })).imoveis.length, 1);
  const empty = fakeBrowser([snapshot([], 0, [])]);
  assert.deepEqual(await extractGustavoSales(empty.browser, { totalEsperado: 0 }), { imoveis: [], excluidosLocacao: [], excluidosVendidos: [] });
  await assert.rejects(extractGustavoSales(empty.browser), /Precontagem/);
});

test("leitor considera somente cards da listagem mas inclui paginacao fora do container", () => {
  const result = withDocument(`${card(99)}<span class="c49-filter-number">2</span><h1 class="c49-filter-title">Imóveis à venda</h1>
    <section id="c49mod-properties-list">${card()}</section><ul class="pagination"><li><a href="${next()}">2</a></li></ul>`,
  lerListagemGustavo);
  assert.equal(result.cards.length, 1);
  assert.equal(result.pages[0], next());
});

test("reconciliacao conserva inclusao e retira anuncios ausentes sem aceitar coleta parcial", () => {
  const current = parseCardGustavo(card());
  const old = { ...current, dataInclusao: "2026-01-01" };
  const sold = parseCardGustavo(card(2));
  const previous = [old, sold];
  const consolidated = consolidateData([current], new Map(previous.map(item => [item.linkReal, item])));
  const result = reconciliarVendas([current], previous, consolidated, project.collection, { totalEsperado: 1, codigoRepetidoPorLink: true });
  assert.equal(result.ativos[0].dataInclusao, "2026-01-01");
  assert.equal(result.retirados.length, 1);
  assert.equal(result.retirados[0].linkReal, sold.linkReal);
  assert.throws(() => reconciliarVendas([current], previous, consolidated, project.collection, { totalEsperado: 2 }), /incompleta/);
});
