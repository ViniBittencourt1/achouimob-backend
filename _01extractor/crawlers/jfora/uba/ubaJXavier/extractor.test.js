import assert from "node:assert/strict";
import { test } from "node:test";
import {
  validarUrlJXavier, lerContagemJXavier, parsePrecoJXavier,
  extrairListagemJXavier, extrairDetalhesJXavier, coletarJXavier,
} from "./extractor.js";
import { project } from "./config.js";
import { CABECALHO_SHEETS } from "../../_utils/sheetsCampos.js";

const now = "2026-10-07T12:00:00.000Z";
const origin = "https://www.jxavier.com.br";

function card({
  id = "1", title = "Casa", status = "Venda", location = "Centro - Ub\u00e1, MG",
  price = "Valor:R$ 1.234,56", area = "1,500", photo = "/photos/noimage.jpg",
} = {}) {
  return `<article>
    <div class="relative"><img src="${photo}"><span>${status}</span><span>ID ${id}</span></div>
    <div><h3><a href="${origin}/detail?id=${id}">${title}</a></h3>
      <h4><a>Rua Um, 10<br>${location}</a></h4>
      <ul><li>${price}</li><li><img src="/icon/area.svg">${area} m\u00b2</li>
        <li><img src="/icon/bedroom.svg">02</li><li><img src="/icon/spacer.svg">00</li></ul>
    </div>
  </article>`;
}

function listing({ total = 1, page = 1, cards, ...options } = {}) {
  const start = (page - 1) * 8 + 1;
  const end = Math.min(page * 8, total);
  const content = cards ?? Array.from({ length: end - start + 1 }, (_, index) =>
    card({ ...options, id: String(start + index) })).join("");
  return `<p>Exibindo de ${start} at\u00e9 ${end} de ${total} resultados</p>
    <div class="grid sm:grid-cols-2">${content}</div>`;
}

function detail({ id = "1", status = "Venda", area = "89.5" } = {}) {
  return `<section><div><h2>Casa</h2><h3>Rua Um, Centro</h3></div>
    <ul><li>Finalidade: ${status}</li><li>ID ${id}</li><li>${area} m\u00b2</li>
      <li>03 dormit\u00f3rio(s)</li><li>02 banheiro(s)</li><li>01 garagem(ns)</li><li>Elevador</li></ul>
    <p>Descricao com 10 carros e 8 quartos, sem caracteristicas estruturadas adicionais.</p>
  </section>
  <aside><ul><li>ID 999</li><li>Finalidade: Loca\u00e7\u00e3o</li><li>999 m\u00b2</li></ul></aside>`;
}

function browserFixture(getHtml, { redirect, status = 200 } = {}) {
  const visits = [];
  let closed = 0;
  return {
    visits, get closed() { return closed; },
    async newPage() {
      let url;
      return {
        async goto(value) {
          url = value;
          visits.push(value);
          return { ok: () => status === 200, status: () => status };
        },
        url: () => redirect ?? url,
        content: () => getHtml(new URL(url), visits.length),
        close: async () => { closed++; },
      };
    },
  };
}

test("rotas exigem origem, finalidade e pagina exatas", () => {
  validarUrlJXavier(project.urlVendas, "venda");
  validarUrlJXavier(`${project.urlLocacao}&page=13`, "locacao", 13);
  for (const url of [
    "https://jxavier.com.br/sale?finalidade=V", `${project.urlVendas}&page=2`,
    `${origin}/rent?finalidade=V`, `${origin}/sale?finalidade=L`, `${origin}/sale`,
  ]) assert.throws(() => validarUrlJXavier(url, "venda"), /fora da finalidade/);
  assert.throws(() => validarUrlJXavier(project.urlVendas, "outro"), /invalida/);
});

test("precos preservam centavos, consulta e zero sem aceitar numeros malformados", () => {
  assert.equal(parsePrecoJXavier("Valor:R$ 1.234,56"), 1234.56);
  assert.equal(parsePrecoJXavier("R$ 200000"), 200000);
  assert.equal(parsePrecoJXavier("R$ 0,00"), 0);
  assert.equal(parsePrecoJXavier("Valor a combinar"), null);
  assert.equal(parsePrecoJXavier("Sob consulta"), null);
  for (const value of ["", "R$ 1,2", "R$ 1.23", "R$ 1,234", "R$ 1.234,56xyz"]) {
    assert.throws(() => parsePrecoJXavier(value), /Preco nao identificado/);
  }
});

test("contador valida intervalos, pagina e ultima pagina de ambas as finalidades", () => {
  for (const [total, page, remaining] of [[307, 39, 3], [98, 13, 2]]) {
    const result = extrairListagemJXavier(listing({ total, page }), "venda", page, now);
    assert.equal(result.total, total);
    assert.equal(result.imoveis.length, remaining);
  }
  assert.throws(() => lerContagemJXavier("<p>Sem resultados</p>"), /ausente/);
  assert.throws(() => lerContagemJXavier("<p>Exibindo de 0 ate 0 de 0 resultados</p>"), /invalido/);
  assert.throws(() => lerContagemJXavier(listing() + listing()), /ambiguo/);
  assert.throws(() => extrairListagemJXavier(listing({ total: 9 }), "venda", 2), /Intervalo/);
});

test("extrai somente grid principal e entrega os vinte campos padronizados", () => {
  const html = listing() + `<aside>${card({ id: "999", status: "Loca\u00e7\u00e3o" })}</aside>
    <div class="list-view">${card()}</div>`;
  const [item] = extrairListagemJXavier(html, "venda", 1, now).imoveis;
  assert.deepEqual(Object.keys(item).sort(), [...CABECALHO_SHEETS].sort());
  assert.equal(item.codigoBase, "1");
  assert.equal(item.preco, 1234.56);
  assert.equal(item.cidade, "uba-mg");
  assert.equal(item.areaValor, 1500);
  assert.equal(item.dormitorioValor, 2);
  assert.equal(item.banheiroValor, null);
  assert.equal(item.linkFoto, "");
  assert.equal(item.dataInclusao, now);
});

test("bairro com hifens usa a ultima cidade e preserva municipios vizinhos", () => {
  const [item] = extrairListagemJXavier(listing({ location: "Rural - Pirauba - Ub\u00e1, MG" }), "venda").imoveis;
  assert.equal(item.bairro, "rural-pirauba");
  assert.equal(item.cidade, "uba-mg");
  const [nearby] = extrairListagemJXavier(listing({ location: "Centro - Pira\u00faba, MG" }), "venda").imoveis;
  assert.equal(nearby.cidade, "pirauba-mg");
  assert.throws(() => extrairListagemJXavier(listing({ location: "Centro - Cidade inexistente, MG" }), "venda"), /fora do catalogo/);
});

test("correcao autorizada de Campestre se limita ao cadastro 8650 com UF AL", () => {
  const location = "Belevile 2 - Campestre, AL";
  const [item] = extrairListagemJXavier(listing({ cards: card({ id: "8650", location }) }), "venda").imoveis;
  assert.equal(item.cidade, "campestre-mg");
  assert.match(item.localizacao, /Campestre, MG$/);
  assert.throws(() => extrairListagemJXavier(listing({ location }), "venda"), /fora do catalogo/);
});

test("categorias especiais usam classificacoes confirmadas e desconhecidas bloqueiam", () => {
  for (const [title, expected] of [
    ["Im\u00f3vel Comercial/residencial", "casa"], ["Im\u00f3vel/outros", "predio"],
    ["Terra\u00e7o", "cobertura"], ["Apartamento Cobertura", "cobertura"],
    ["Ponto Comercial/residencial", "ponto"], ["Terreno Rural", "terreno"],
    ["Barrac\u00e3o", "galpao"], ["Cobertura Duplex", "cobertura"], ["Quitinete", "loft"],
  ]) assert.equal(extrairListagemJXavier(listing({ title }), "venda").imoveis[0].tipoImovel, expected);
  assert.throws(() => extrairListagemJXavier(listing({ title: "Desconhecido" }), "venda"), /fora do catalogo/);
});

test("cards incompletos, repetidos ou de outra finalidade bloqueiam", () => {
  for (const html of [
    listing({ total: 2, cards: card() }),
    listing({ total: 2, cards: card() + card() }),
    listing({ status: "Loca\u00e7\u00e3o" }),
    listing().replace("/detail?id=1", "/detail?id=abc"),
  ]) assert.throws(() => extrairListagemJXavier(html, "venda"), /preservados/);
});

test("detalhes usam ID exato, finalidade e caracteristicas estruturadas sem sidebar", () => {
  const item = extrairListagemJXavier(listing(), "venda").imoveis[0];
  const result = extrairDetalhesJXavier(detail(), item, "venda");
  assert.deepEqual(result, { areaValor: 89.5, dormitorioValor: 3, banheiroValor: 2, garagemValor: 1, elevadorValor: 1 });
  assert.throws(() => extrairDetalhesJXavier(detail({ id: "10" }), item, "venda"), /fora do imovel/);
  assert.throws(() => extrairDetalhesJXavier(detail({ status: "Loca\u00e7\u00e3o" }), item, "venda"), /finalidade/);
  assert.throws(() => extrairDetalhesJXavier("<h2>Erro</h2>", item, "venda"), /fora do imovel/);
});

test("coleta todas as paginas, confirma total e conserva datas e atributos anteriores", async () => {
  const browser = browserFixture(url => listing({ total: 9, page: Number(url.searchParams.get("page") || 1) }));
  const previous = { dataInclusao: "2020-01-01", banheiroValor: 4, areaValor: 99 };
  const counts = [];
  const result = await coletarJXavier(browser, project, "venda", {
    enriquecer: false, anteriores: new Map([[`${origin}/detail?id=1`, previous]]),
    onCount: async total => counts.push(total),
  });
  assert.equal(result.imoveis.length, 9);
  assert.deepEqual(counts, [9]);
  assert.equal(browser.visits.length, 3);
  assert.equal(browser.closed, 3);
  assert.equal(result.imoveis[0].dataInclusao, "2020-01-01");
  assert.equal(result.imoveis[0].banheiroValor, 4);
  assert.equal(result.imoveis[0].areaValor, 1500);
});

test("IDs repetidos, total alterado e primeira pagina instavel impedem sincronizacao", async () => {
  const duplicate = browserFixture(url => url.searchParams.get("page")
    ? listing({ total: 9, page: 2, cards: card() }) : listing({ total: 9 }));
  await assert.rejects(coletarJXavier(duplicate, project, "venda", { enriquecer: false }), /repetido entre paginas/);
  const changed = browserFixture(url => listing({ total: url.searchParams.get("page") ? 10 : 9, page: Number(url.searchParams.get("page") || 1) }));
  await assert.rejects(coletarJXavier(changed, project, "venda", { enriquecer: false }), /Total mudou/);
  const unstable = browserFixture((_url, visit) => listing({ cards: card({ id: visit === 1 ? "1" : "2" }) }));
  await assert.rejects(coletarJXavier(unstable, project, "venda", { enriquecer: false }), /Listagem mudou/);
});

test("falha HTTP, redirecionamento e detalhes invalidos fecham pagina e rejeitam coleta", async () => {
  const failed = browserFixture(() => listing(), { status: 500 });
  await assert.rejects(coletarJXavier(failed, project, "venda"), /HTTP 500/);
  assert.equal(failed.closed, 1);
  const redirected = browserFixture(() => listing(), { redirect: project.urlLocacao });
  await assert.rejects(coletarJXavier(redirected, project, "venda"), /fora da finalidade/);
  assert.equal(redirected.closed, 1);
  const invalid = browserFixture(url => url.pathname === "/detail" ? detail({ id: "2" }) : listing());
  await assert.rejects(coletarJXavier(invalid, project, "venda"), /Detalhes 1/);
  assert.equal(invalid.closed, 3);
});

test("novos anuncios recebem detalhes; anuncios existentes nao sao visitados novamente", async () => {
  const browser = browserFixture(url => url.pathname === "/detail" ? detail() : listing());
  const result = await coletarJXavier(browser, project, "venda");
  assert.equal(result.imoveis[0].banheiroValor, 2);
  assert.equal(browser.visits.filter(url => new URL(url).pathname === "/detail").length, 1);
  const existing = browserFixture(() => listing());
  await coletarJXavier(existing, project, "venda", { anteriores: new Map([[`${origin}/detail?id=1`, { dataInclusao: now }]]) });
  assert.equal(existing.visits.length, 2);
});
