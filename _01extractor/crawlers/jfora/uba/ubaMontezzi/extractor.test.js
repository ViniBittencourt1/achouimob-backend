import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extrairListagemMontezzi, extrairDetalhesMontezzi, coletarMontezzi,
  parsePrecoMontezzi, validarUrlMontezzi,
} from "./extractor.js";
import { project } from "./config.js";
import { CABECALHO_SHEETS } from "../../_utils/sheetsCampos.js";

const now = "2026-11-06T18:00:00.000Z";
function card({ id = "1", title = "Casa - Centro - Ub\u00e1", status = "Venda", price = "R$350.000,75" } = {}) {
  return `<div class="inner-box"><div class="image-box"><figure class="image"><img src="./assets/foto.jpg"></figure>
    <span class="category">Cod: ${id}</span><span class="buy-btn">${status}</span></div>
    <div class="lower-content"><div class="title-text"><h4><a href="imovel-detalhe.php?codimo=${id}">${title}</a></h4></div>
    <div class="price-info"><h4>${price}</h4></div><p>Texto com 10 quartos e area 999 m2</p>
    <ul class="more-details"><li>3 quartos</li><li>2 vagas</li></ul></div></div>`;
}
function listing({ total = 1, page = 1, cards, ...options } = {}) {
  const start = (page - 1) * 8 + 1;
  const end = Math.min(total, page * 8);
  return `<h4>Selecionamos ${total} im\u00f3veis: exibindo de ${start} a ${end}</h4>
    <div class="deals-list-content">${cards ?? Array.from({ length: end - start + 1 }, (_, index) =>
    card({ id: String(start + index), ...options })).join("")}</div>`;
}
function detail({ id = "1", status = "Venda", title = "Casa - Centro - Ub\u00e1", address = "" } = {}) {
  return `<div class="top-details"><div class="left-column"><h3>${title}${address ? `<br>${address}` : ""}</h3></div>
    <ul class="category"><li>C\u00f3d: ${id}</li><li>${status}</li></ul></div>
    <div class="details-box content-widget"><ul class="list"><li>C\u00f3digo do im\u00f3vel: <span>${id}</span></li></ul>
    <ul class="list"><li>2 banheiros</li><li>200 m2 area terreno</li><li>150 m2 area construida</li></ul></div>
    <aside><li>999 quartos</li><li>500 m2 area construida</li></aside>`;
}
function fixture(content, { redirect, status = 200 } = {}) {
  const visits = [];
  let closed = 0;
  return {
    visits, get closed() { return closed; },
    async newPage() {
      let url;
      return {
        goto: async value => {
          visits.push(value);
          url = value;
          return { ok: () => status === 200, status: () => status };
        },
        url: () => redirect ?? url,
        content: () => content(new URL(url), visits.length),
        close: async () => { closed++; },
      };
    },
  };
}

test("rotas exigem origem, finalidade, tamanho, pagina e filtros sem restricoes", () => {
  validarUrlMontezzi(project.urlVendas, "venda");
  validarUrlMontezzi(project.urlLocacao, "locacao");
  validarUrlMontezzi(`${project.urlVendas}&page=42&pagesize=8`, "venda", 42);
  for (const url of [
    project.urlLocacao, project.urlVendas.replace("www.", ""), `${project.urlVendas}&page=2`,
    `${project.urlVendas}&pagesize=20`, project.urlVendas.replace("cidade=0", "cidade=1"),
    `${project.urlVendas}&extra=1`, `${project.urlVendas}#x`,
  ]) assert.throws(() => validarUrlMontezzi(url, "venda"), /fora da finalidade/);
});

test("preco conserva centavos e distingue consulta e zero de dados invalidos", () => {
  assert.equal(parsePrecoMontezzi("R$350.000,75"), 350000.75);
  assert.equal(parsePrecoMontezzi("R$0,00"), 0);
  assert.equal(parsePrecoMontezzi("A combinar"), null);
  for (const value of ["", "R$1,2", "R$1.23", "R$1,234", "R$1.000,00x"]) {
    assert.throws(() => parsePrecoMontezzi(value), /invalido/);
  }
});

test("parser usa apenas cards principais e entrega os vinte campos", () => {
  const html = listing() + `<aside>${card({ status: "Loca\u00e7\u00e3o" })}</aside>
    <div class="grid-view">${card()}</div>`;
  const [item] = extrairListagemMontezzi(html, "venda", 1, now).imoveis;
  assert.deepEqual(Object.keys(item).sort(), [...CABECALHO_SHEETS].sort());
  assert.equal(item.cidade, "uba-mg");
  assert.equal(item.bairro, "centro");
  assert.equal(item.tipoImovel, "casa");
  assert.equal(item.preco, 350000.75);
  assert.equal(item.dormitorioValor, 3);
  assert.equal(item.garagemValor, 2);
  assert.equal(item.banheiroValor, null);
  assert.equal(item.areaValor, null);
  assert.equal(item.dataInclusao, now);
  assert.equal(item.linkFoto, "https://www.montezzi.com.br/assets/foto.jpg");
});

test("ultima pagina valida 333 vendas e 156 alugueis sem eliminar ocorrencias", () => {
  assert.equal(extrairListagemMontezzi(listing({ total: 333, page: 42 }), "venda", 42).imoveis.length, 5);
  assert.equal(extrairListagemMontezzi(listing({ total: 156, page: 20, status: "Loca\u00e7\u00e3o" }), "locacao", 20).imoveis.length, 4);
  const result = extrairListagemMontezzi(listing({ total: 2, cards: card() + card({ price: "R$400.000,00" }) }), "venda");
  assert.deepEqual(result.imoveis.map(item => item.preco), [350000.75, 400000]);
});

test("cidade e bairro preservam municipios, distritos e excecao sem localizacao", () => {
  for (const [title, city, bairro] of [
    ["Lote - Belle Ville II - Astolfo Dutra", "astolfo-dutra-mg", "belle-ville-ii"],
    ["Casa - Centro - Cabo Frio", "cabo-frio-rj", "centro"],
    ["Ch\u00e1cara - Zona Rural - Diamante de Uba", "uba-mg", "zona-rural"],
    ["Ch\u00e1cara - Centro - Ubari", "uba-mg", "centro"],
    ["Casa - Bairro - Rural - Ub\u00e1", "uba-mg", "bairro-rural"],
  ]) {
    const [item] = extrairListagemMontezzi(listing({ title }), "venda").imoveis;
    assert.equal(item.cidade, city);
    assert.equal(item.bairro, bairro);
    assert.match(item.localizacao, new RegExp(title.split(" - ").at(-1)));
  }
  const [unknown] = extrairListagemMontezzi(listing({ cards: card({ id: "5285", title: "Kitinet - Indefinido - Indefinida" }) }), "venda").imoveis;
  assert.equal(unknown.cidade, "");
  assert.equal(unknown.bairro, "");
  assert.equal(unknown.tipoImovel, "loft");
  assert.throws(() => extrairListagemMontezzi(listing({ title: "Casa - Indefinido - Indefinida" }), "venda"), /Cidade fora/);
});

test("contador, finalidade, link, foto e tipo invalidos rejeitam coleta parcial", () => {
  for (const html of [
    listing({ total: 2, cards: card() }), listing() + listing(),
    listing({ status: "Loca\u00e7\u00e3o" }), listing({ title: "Desconhecido - Centro - Ub\u00e1" }),
    listing().replace("codimo=1", "codimo=abc"), listing().replace("./assets/foto.jpg", "javascript:alert(1)"),
    listing().replace("Selecionamos 1", "Selecionamos 0"),
  ]) assert.throws(() => extrairListagemMontezzi(html, "venda"));
  assert.throws(() => extrairListagemMontezzi(listing(), "venda", 2), /Intervalo/);
});

test("detalhes validam identidade exata, finalidade e endereco complementar", () => {
  const item = extrairListagemMontezzi(listing(), "venda").imoveis[0];
  assert.deepEqual(extrairDetalhesMontezzi(detail({ address: "Rua Um, 10" }), item, "venda"), {
    banheiroValor: 2, areaValor: 150, localizacao: "Rua Um, 10 - Centro - Ub\u00e1",
  });
  assert.throws(() => extrairDetalhesMontezzi(detail({ id: "10" }), item, "venda"), /fora do imovel/);
  assert.throws(() => extrairDetalhesMontezzi(detail({ status: "Loca\u00e7\u00e3o" }), item, "venda"), /fora do imovel/);
  assert.throws(() => extrairDetalhesMontezzi(detail({ title: "Casa diferente" }), item, "venda"), /fora do imovel/);
});

test("coleta paginada conserva repeticoes e datas sem detalhes no check", async () => {
  const browser = fixture(url => listing({
    total: 9, page: Number(url.searchParams.get("page")),
    ...(url.searchParams.get("page") === "2" ? { cards: card() } : {}),
  }));
  const previous = { dataInclusao: "2020-01-01", banheiroValor: 4 };
  const counts = [];
  const result = await coletarMontezzi(browser, project, "venda", {
    enriquecer: false, anteriores: new Map([["https://www.montezzi.com.br/imovel-detalhe.php?codimo=1", previous]]),
    onCount: async total => counts.push(total),
  });
  assert.equal(result.imoveis.length, 9);
  assert.equal(new Set(result.imoveis.map(item => item.codigoBase)).size, 8);
  assert.equal(result.imoveis[0].dataInclusao, "2020-01-01");
  assert.equal(result.imoveis[8].banheiroValor, 4);
  assert.deepEqual(counts, [9]);
  assert.equal(browser.closed, 3);
});

test("enriquece uma vez por link e mantem cada ocorrencia de preco diferente", async () => {
  const browser = fixture(url => url.pathname.includes("detalhe")
    ? detail() : listing({ total: 2, cards: card() + card({ price: "R$400.000,00" }) }));
  const result = await coletarMontezzi(browser, project, "venda");
  assert.deepEqual(result.imoveis.map(item => item.preco), [350000.75, 400000]);
  assert.ok(result.imoveis.every(item => item.areaValor === 150 && item.banheiroValor === 2));
  assert.equal(browser.visits.filter(url => url.includes("detalhe")).length, 1);
});

test("mudanca de total, primeira pagina, HTTP ou detalhe impede retorno parcial", async () => {
  for (const browser of [
    fixture((_url, visit) => listing({ total: visit === 1 ? 1 : 2 })),
    fixture((_url, visit) => listing({ cards: card({ id: visit === 1 ? "1" : "2" }) })),
    fixture(() => listing(), { status: 500 }),
    fixture(() => listing(), { redirect: project.urlLocacao }),
    fixture(url => url.pathname.includes("detalhe") ? detail({ id: "2" }) : listing()),
  ]) {
    await assert.rejects(coletarMontezzi(browser, project, "venda"));
    assert.equal(browser.closed, browser.visits.length);
  }
});
