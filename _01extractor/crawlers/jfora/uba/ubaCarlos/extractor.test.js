import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extrairListagemCarlos, extrairDetalhesCarlos, localizacaoCarlos,
  parsePrecoCarlos, validarUrlCarlos, coletarCarlos, fetchDetalheCarlos,
} from "./extractor.js";
import { project } from "./config.js";
import { CABECALHO_SHEETS } from "../../_utils/sheetsCampos.js";

const now = "2026-11-06T19:00:00.000Z";
function card({ id = "367", code = "1074", title = "Casa em Uba", tipo = "Casa", status = "Venda", price = "R$ 170.000,75" } = {}) {
  return `<div class="car-card"><div class="card-img-wrapper">
    <img src="uploads/imoveis/foto.jpg"><div class="card-badges">
    <span class="badge-item">Destaque</span><span class="badge-item">${status}</span></div></div>
    <div class="card-content"><div><span class="car-brand">${tipo}</span><span>#${code}</span></div>
    <a class="car-title" href="imovel.php?id=${id}">${title}</a>
    <div class="car-specs"><div title="Bairro">JD ESPERANCA-..</div><div>2 Qtos</div><div>0m²</div></div>
    <div class="car-price">${price}</div></div></div>`;
}
function listing({ total = 1, cards, ...options } = {}) {
  return `<div class="results-count"><span>${total}</span> im\u00f3veis encontrados</div>
    <div class="cars-grid">${cards ?? card(options)}</div>`;
}
function detail({
  code = "1074", title = "Casa em Uba", tipo = "Casa", status = "Venda", active = "Ativo",
  price = "R$ 170.000,75", location = "JD ESPERAN\u00c7A- TANQUINHO, UB\u00c1",
  area = "0 m\u00b2", quartos = "2", suites = "1", vagas = "0",
} = {}) {
  const specs = [["Tipo", tipo], ["\u00c1rea", area], ["Quartos", quartos], ["Su\u00edtes", suites], ["Vagas", vagas], ["Modalidade", status]];
  return `<div class="gallery-box"><span class="badge-status">${active}</span></div>
    <div class="property-title-block"><div>C\u00f3d: ${code}</div><h1 class="property-name">${title}</h1>
    <div class="property-meta">${location}</div></div>
    <div class="specs-section">${specs.map(([label, value]) => `<div class="spec-item">
      <div class="spec-label">${label}</div><div class="spec-val">${value}</div></div>`).join("")}</div>
    <div class="price-tag-value">${price}</div>
    <p>Descricao com 8 banheiros, 10 carros e 500 metros. Nao sao campos estruturados.</p>
    <aside><div class="spec-item"><div class="spec-label">Quartos</div><div class="spec-val">99</div></div></aside>`;
}
const item = options => extrairListagemCarlos(listing(options), "venda").imoveis[0];
function fixture(getHtml, { status = 200, redirect } = {}) {
  const visits = [];
  let closed = 0;
  const page = {
    goto: async url => {
      visits.push(url);
      return { ok: () => status === 200, status: () => status };
    },
    url: () => redirect ?? visits.at(-1),
    content: () => getHtml(new URL(visits.at(-1)), visits.length),
    evaluate: async (fn, url) => {
      assert.equal(fn.name, "fetchDetalheCarlos");
      visits.push(url);
      return getHtml(new URL(url), visits.length);
    },
    close: async () => { closed++; },
  };
  return { visits, get closed() { return closed; }, newPage: async () => page };
}

test("rotas exigem origem, finalidade e filtros vazios", () => {
  validarUrlCarlos(project.urlVendas, "venda");
  validarUrlCarlos(project.urlLocacao, "locacao");
  for (const url of [
    project.urlLocacao, project.urlVendas.replace("www.", ""),
    `${project.urlVendas}&page=2`, project.urlVendas.replace("busca=", "busca=centro"),
    project.urlVendas.replace("tipo_imovel=", "tipo_imovel=Casa"), `${project.urlVendas}#x`,
  ]) assert.throws(() => validarUrlCarlos(url, "venda"), /fora da finalidade/);
  assert.throws(() => validarUrlCarlos(project.urlVendas, "outro"), /invalida/);
});

test("preco conserva centavos e zero sem aceitar numeros malformados", () => {
  assert.equal(parsePrecoCarlos("R$ 170.000,75"), 170000.75);
  assert.equal(parsePrecoCarlos("R$ 0,00"), 0);
  for (const text of ["", "R$ 1,2", "R$ 1.23", "R$ 1,234", "Sob consulta", "R$ 1.000,00x"]) {
    assert.throws(() => parsePrecoCarlos(text), /invalido/);
  }
});

test("listagem completa confere total e captura codigo publico distinto do ID de URL", () => {
  const result = extrairListagemCarlos(listing() + `<aside>${card({ status: "Aluguel" })}</aside>`, "venda");
  assert.equal(result.total, 1);
  assert.equal(result.imoveis[0].codigoBase, "1074");
  assert.equal(result.imoveis[0].linkReal, "https://www.carloscorretordeimoveis.com/imovel.php?id=367");
  assert.equal(result.imoveis[0].preco, 170000.75);
  assert.equal(result.imoveis[0].linkFoto, "https://www.carloscorretordeimoveis.com/uploads/imoveis/foto.jpg");
  assert.equal(item({ code: "02" }).codigoBase, "02");
});

test("contador, identidade, modalidade, tipo e foto invalidos rejeitam lista", () => {
  for (const html of [
    listing({ total: 2 }), listing({ total: 0, cards: "" }), listing() + listing(),
    listing({ total: 2, cards: card() + card() }),
    listing({ status: "Aluguel" }), listing({ tipo: "Desconhecido" }),
    listing({ id: "abc" }), listing({ code: "" }), listing({ code: "00" }),
    listing().replace("uploads/imoveis/foto.jpg", "javascript:alert(1)"),
    listing().replace("imovel.php?id=367", "https://example.com/imovel.php?id=367"),
  ]) assert.throws(() => extrairListagemCarlos(html, "venda"));
});

test("detalhes retornam vinte campos, bairro completo e apenas atributos estruturados", () => {
  const result = extrairDetalhesCarlos(detail(), item(), "venda", now);
  assert.deepEqual(Object.keys(result).sort(), [...CABECALHO_SHEETS].sort());
  assert.equal(result.localizacao, "JD ESPERAN\u00c7A- TANQUINHO, UB\u00c1");
  assert.equal(result.bairro, "jd-esperanca-tanquinho");
  assert.equal(result.cidade, "uba-mg");
  assert.equal(result.areaValor, 0);
  assert.equal(result.dormitorioValor, 2);
  assert.equal(result.garagemValor, 0);
  assert.equal(result.banheiroValor, null);
  assert.equal(result.ambienteValor, null);
  assert.equal(result.elevadorValor, null);
  assert.equal(result.dataInclusao, now);
  assert.equal(result.atualizadoEm, now);
  assert.equal(result.tipoImovel, "casa");
  assert.equal(result.codigoBase, "1074");
});

test("campos do site prevalecem sobre narrativa; suites nao representam numero de banheiros", () => {
  const result = extrairDetalhesCarlos(detail({ suites: "3", quartos: "0", vagas: "0", area: "105,5 m\u00b2" }), item(), "venda");
  assert.equal(result.banheiroValor, null);
  assert.equal(result.dormitorioValor, 0);
  assert.equal(result.garagemValor, 0);
  assert.equal(result.areaValor, 105.5);
  const title = "Galpao para ALUGUEL";
  assert.equal(extrairDetalhesCarlos(detail({ title }), item({ title }), "venda").titulo, title);
});

test("cidades do catalogo normalizam formato sem presumir Uba", () => {
  for (const [location, code, expected] of [
    ["Centro, UB\u00c1/MG", "1", "uba-mg"], ["Centro, Ub\u00e1- MG", "1", "uba-mg"],
    ["Centro, Juiz de Fora", "1", "juiz-de-fora-mg"],
    ["Lote \u00e0 venda, Rosa de Toledo, Ub\u00e1/MG | C\u00f3d.: 587", "587", "uba-mg"],
    ["Santo Antonio, Dores do Turvo Especifica", "83", "dores-do-turvo-mg"],
    ["Manoel Moreira, S", "55", "sao-geraldo-mg"],
    ["Zona Rural, Torixor\u00e9u", "201", "torixoreu-mt"],
    ["Zona Rural, General Carneiro", "201", "general-carneiro-mt"],
  ]) assert.equal(localizacaoCarlos(location, code).cidade, expected);
});

test("cidade confirmada do anuncio 352 e Tocantins/MG sem generalizar para outros anuncios", () => {
  const title = "CHÁCARA À VENDA | AMPLA, CONFORTÁVEL E CERCADA DE TRANQUILIDADE – UBÁ/ TOCANTINS";
  const location = "Próximo ao Vale do Ouro , UBÁ/TOCANTINS";
  const warnings = [];
  const warn = console.warn;
  console.warn = message => warnings.push(message);
  try {
    const record = extrairDetalhesCarlos(detail({ code: "1059", title, tipo: "Sítio/Chácara", location }),
      item({ id: "352", code: "1059", title, tipo: "Sítio/Chácara" }), "venda", now);
    assert.equal(record.cidade, "tocantins-mg");
    assert.equal(record.localizacao, location);
    assert.equal(record.bairro, "proximo-ao-vale-do-ouro");
    assert.equal(record.linkReal, "https://www.carloscorretordeimoveis.com/imovel.php?id=352");
    assert.equal(localizacaoCarlos("Zona Rural, Ubá/ Tocantins", "1059").cidade, "tocantins-mg");
    assert.equal(localizacaoCarlos(location, "201").cidade, "");
    assert.equal(localizacaoCarlos("Centro, Ubá", "1059").cidade, "uba-mg");
    assert.match(warnings.join("\n"), /Tocantins\/MG conforme confirmado/);
  } finally { console.warn = warn; }
});

test("fora do catalogo fica vazio com aviso, Ubari permanece cidade e endereco e preservado", () => {
  for (const cidade of ["UB\u00c1/TOCANTINS", "Rodovia ub\u00e1 x Rodeiro", "Rodovia Ub\u00e1 x Tocantins", "N\u00e3o Informada", "Cidade nova", "S"]) {
    const result = localizacaoCarlos(`Zona Rural, ${cidade}`, "201");
    assert.equal(result.cidade, "");
    assert.equal(result.localizacao, `Zona Rural, ${cidade}`);
    assert.equal(result.bairro, "zona-rural");
  }
  assert.equal(localizacaoCarlos("Zona Rural, Ubari", "277").cidade, "Ubari");
  const result = localizacaoCarlos("Ubari, Ub\u00e1", "1");
  assert.equal(result.cidade, "uba-mg");
  assert.equal(result.bairro, "ubari");
  assert.throws(() => localizacaoCarlos("", "1"), /Localizacao/);
});

test("detalhes exigem codigo, titulo, tipo, finalidade, status e preco estaveis", () => {
  for (const options of [
    { code: "1" }, { title: "Outro imovel" }, { tipo: "Apartamento" }, { status: "Aluguel" },
    { active: "Inativo" }, { price: "R$ 180.000,00" }, { quartos: "" }, { vagas: "-1" }, { area: "100 ha" },
  ]) assert.throws(() => extrairDetalhesCarlos(detail(options), item(), "venda"));
  assert.throws(() => extrairDetalhesCarlos(detail().replace("Su\u00edtes", "Quartos"), item(), "venda"), /repetida/);
});

test("coleta verifica todos os detalhes mesmo em check e preserva data original sem valores antigos", async () => {
  const browser = fixture(url => url.pathname === "/imoveis.php" ? listing() : detail());
  const old = { dataInclusao: "2020-01-01", areaValor: 999, cidade: "errada" };
  const counts = [];
  const result = await coletarCarlos(browser, project, "venda", {
    enriquecer: false, anteriores: new Map([[item().linkReal, old]]), onCount: async total => counts.push(total),
  });
  assert.equal(result.totalEsperado, 1);
  assert.equal(result.imoveis.length, 1);
  assert.equal(result.imoveis[0].dataInclusao, "2020-01-01");
  assert.equal(result.imoveis[0].areaValor, 0);
  assert.equal(result.imoveis[0].cidade, "uba-mg");
  assert.deepEqual(counts, [1]);
  assert.equal(browser.visits.length, 3);
  assert.equal(browser.closed, 1);
});

test("aluguel e filtrado e validado inclusive nos detalhes", async () => {
  const browser = fixture(url => url.pathname === "/imoveis.php"
    ? listing({ status: "Aluguel" }) : detail({ status: "Aluguel" }));
  const result = await coletarCarlos(browser, project, "locacao");
  assert.equal(result.imoveis.length, 1);
  assert.equal(result.imoveis[0].preco, 170000.75);
  assert.equal(browser.visits[0], project.urlLocacao);
});

test("coleta parcial, preco/ordem alterados, HTTP e redirecionamentos nao retornam sucesso", async () => {
  for (const browser of [
    fixture(() => listing(), { status: 500 }),
    fixture(() => listing(), { redirect: project.urlLocacao }),
    fixture(url => url.pathname === "/imoveis.php" ? listing() : detail({ code: "99" })),
    fixture((url, visit) => url.pathname === "/imovel.php" ? detail()
      : listing({ price: visit === 1 ? "R$ 170.000,75" : "R$ 180.000,00" })),
    fixture((url, visit) => url.pathname === "/imovel.php" ? detail()
      : listing({ total: visit === 1 ? 1 : 2, cards: visit === 1 ? card() : card() + card({ id: "2", code: "2" }) })),
  ]) {
    await assert.rejects(coletarCarlos(browser, project, "venda"));
    assert.equal(browser.closed, 1);
  }
});

test("consulta de detalhe usa GET com timeout e rejeita HTTP, redirecionamento e timeout", async () => {
  const previous = globalThis.fetch;
  const url = "https://www.carloscorretordeimoveis.com/imovel.php?id=367";
  try {
    globalThis.fetch = async (target, options) => {
      assert.equal(target, url);
      assert.ok(options.signal instanceof AbortSignal);
      return { ok: true, url, text: async () => "<h1>Detalhe</h1>" };
    };
    assert.equal(await fetchDetalheCarlos(url), "<h1>Detalhe</h1>");
    globalThis.fetch = async () => ({ ok: false, status: 500 });
    await assert.rejects(fetchDetalheCarlos(url), /HTTP 500/);
    globalThis.fetch = async () => ({ ok: true, url: "https://example.com" });
    await assert.rejects(fetchDetalheCarlos(url), /redirecionado/);
    globalThis.fetch = async () => { throw new DOMException("Prazo excedido", "TimeoutError"); };
    await assert.rejects(fetchDetalheCarlos(url), /Prazo excedido/);
  } finally { globalThis.fetch = previous; }
});
