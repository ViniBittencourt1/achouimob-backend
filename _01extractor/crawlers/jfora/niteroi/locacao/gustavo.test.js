import assert from "node:assert/strict";
import { test } from "node:test";
import { contar, coletar, parseTotalLocacaoGustavo, validarBuscaLocacaoGustavo } from "./gustavo.js";
import { parseCardGustavo } from "../nitGustavo/extractor.js";
import { getProjetoNiteroiLocacao } from "./projects.js";

const project = getProjetoNiteroiLocacao("nitGustavo");
const card = (id = 1, status = "") => `<article class="c49-property-card">
  <div class="c49-strip">${status}</div><h2 class="c49-property-card_title">Apartamento para alugar</h2>
  <span class="c49-property-card_type">Apartamento</span><span class="c49-property-card_code">Cód. ${id}</span>
  <div class="c49-property-card_address">Icaraí, Niterói - RJ</div>
  <div class="c49-property-card_photo"><a href="/${id}/imoveis/venda-locacao-apartamento-icarai-niteroi-rj"><img src="/foto.jpg"></a></div>
  <div class="c49-property-card_price"><div><span>R$</span> 900.000,00 <span>Venda</span></div>
  <div><span>R$</span> 2.300,50 <span>Locação</span></div><div>Condomínio R$ 900,00</div></div></article>`;
const parse = html => parseCardGustavo(html, { negociacao: "locacao", projeto: project });
const snapshot = (cards = [card()], total = cards.length) => ({ cards, label: String(total), heading: "Imóveis à locação", pages: [] });
function fakeBrowser(data, redirect = project.url) {
  let closed = 0;
  return { newPage: async () => ({
    goto: async () => ({ ok: () => true }), url: () => redirect,
    evaluate: async () => data, close: async () => closed++,
  }), closed: () => closed };
}

test("contagem usa somente o total informado pela listagem de locacao", async () => {
  assert.equal(parseTotalLocacaoGustavo({ label: "1.234", heading: " Imóveis à locação " }), 1234);
  for (const data of [{ label: "4", heading: "Imóveis à venda" }, { label: "4 imóveis", heading: "Imóveis à locação" }, { label: "", heading: "Imóveis à locação" }]) assert.throws(() => parseTotalLocacaoGustavo(data));
  const browser = fakeBrowser(snapshot());
  assert.equal(await contar(browser, project), 1);
  assert.equal(browser.closed(), 1);
  assert.throws(() => validarBuscaLocacaoGustavo(project, project.url.replace("tipo=2", "tipo=1")));
  await assert.rejects(contar(fakeBrowser(snapshot(), project.url.replace("/locacao/", "/venda/")), project));
});

test("parser parametrizado escolhe aluguel mensal, nao venda nem taxas, com slugs", () => {
  const item = parse(card());
  assert.equal(item.preco, 2300.5);
  assert.equal(item.tipoImovel, "apartamento");
  assert.equal(item.bairro, "icarai");
  assert.equal(item.cidade, "niteroi-rj");
  assert.equal(item.corretor, project.displayName);
  assert.equal(parse(card().replace("2.300,50", "Sob consulta")).preco, null);
  assert.equal(parse(card().replace("venda-locacao-", "locacao-")).preco, 2300.5);
  assert.throws(() => parse(card().replace("venda-locacao-", "venda-")));
  assert.throws(() => parse(card().replace("<span>Locação</span>", "<span>Temporada</span>")));
  assert.throws(() => parse(card(1, "Locado")), { code: "GUSTAVO_RENTAL_ONLY" });
  assert.throws(() => parse(card(1, "Vendido")), { code: "GUSTAVO_SOLD" });
});

test("coleta completa conserva inclusao anterior e exige total sem repeticoes", async () => {
  const previous = { ...parse(card()), dataInclusao: "2025-01-01T00:00:00.000Z" };
  const records = await coletar(fakeBrowser(snapshot()), project, { totalEsperado: 1, anteriores: new Map([[previous.linkReal, previous]]) });
  assert.equal(records.length, 1);
  assert.equal(records[0].dataInclusao, previous.dataInclusao);
  assert.equal(records[0].preco, 2300.5);
  await assert.rejects(coletar(fakeBrowser(snapshot([card(), card()])), project, { totalEsperado: 2 }), /repetido/);
  await assert.rejects(coletar(fakeBrowser(snapshot()), project, { totalEsperado: 2 }), /Total alterado/);
  await assert.rejects(coletar(fakeBrowser(snapshot([card()], 2)), project, { totalEsperado: 2 }), /incompleta/);
  await assert.rejects(coletar(fakeBrowser(snapshot()), project, {}), /Precontagem/);
});

test("vendidos/locados contam no total do site mas sao excluidos e informados", async () => {
  const data = snapshot([card(), card(2, "Locado"), card(3, "Vendido")]);
  const browser = fakeBrowser(data);
  const records = await coletar(browser, project, { totalEsperado: 3 });
  assert.equal(records.length, 1);
  assert.equal(records.excluidos, 2);
  assert.equal(browser.closed(), 1);
});

test("paginacao de locacao aceita href publico preservando busca e tipo=2", async () => {
  const destination = new URL(project.url);
  destination.pathname += "/2";
  for (const href of [destination.href, `${destination.pathname}${destination.search}`, "javascript:pagination('35', '2', '78963', '');"]) {
    const destinations = [];
    let closed = 0;
    const browser = { newPage: async () => ({
      goto: async url => { destinations.push(url); return { ok: () => true }; },
      url: () => destinations.at(-1),
      evaluate: async () => destinations.length === 1
        ? { ...snapshot([card()], 2), pages: [href] } : snapshot([card(2)], 2),
      close: async () => { closed++; },
    }) };
    const records = await coletar(browser, project, { totalEsperado: 2 });
    assert.equal(records.length, 2);
    assert.deepEqual(destinations, [project.url, destination.href]);
    assert.equal(closed, 1);
  }
  const invalid = new URL(destination);
  invalid.search = "?tipo=1";
  await assert.rejects(coletar(fakeBrowser({ ...snapshot([card()], 2), pages: [invalid.href] }), project,
    { totalEsperado: 2 }), /incompleta/);
});
