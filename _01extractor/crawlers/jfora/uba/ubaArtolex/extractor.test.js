import assert from "node:assert/strict";
import { test } from "node:test";
import {
  validarUrlArtolex, fetchArtolex, precoArtolex, extrairListagemArtolex,
  extrairDetalhesArtolex, coletarArtolex,
} from "./extractor.js";
import { project } from "./config.js";
import { CABECALHO_SHEETS } from "../../_utils/sheetsCampos.js";

const origin = "https://www.artolex.com.br";
const now = "2026-11-06T21:00:00.000Z";
function card({
  code = "881", modalidade = "ALUGUEL / VENDA", price = "R$ 10.000,75 / M\u00eas",
  tipo = "Loja", bairro = "Centro", cidade = "Ub\u00e1", uf = "MG", area = "500Mts\u00b2",
} = {}) {
  return `<li class="well"><a class="property-featured-image" href="?a=ver&amp;id=${code}"><img src="fotos/2979.jpg"></a>
    <div class="property-info"><div class="price"><span class="label-info">${modalidade}</span>
    <span class="label-success">${price}</span></div><h3><a href="?a=ver&amp;id=${code}">${tipo} - ${bairro}</a></h3>
    <span class="location">${cidade} / ${uf} [C\u00f3d: ${code}]</span></div>
    <div class="property-amenities"><span class="area"><strong>${area}</strong></span>
    <span class="baths"><strong>N/D</strong></span><span class="beds"><strong>2</strong></span>
    <span class="parking"><strong>0</strong></span></div></li>`;
}
function listing({ pg = 1, pages = 1, mode = "locacao", codes = ["881"], ...options } = {}) {
  const interesse = mode === "venda" ? "comprar" : "alugar";
  const pagination = pages === 1 ? "" : `<ul class="pagination"><li class="active"><a href="#">${pg}</a></li>${
    Array.from({ length: pages }, (_, i) => i + 1).filter(n => n !== pg).map(n =>
      `<li><a href="?a=busca&amp;interesse=${interesse}&amp;pg=${n}">${n}</a></li>`).join("")}</ul>`;
  return `<ul>${codes.map(code => card({ ...options, code })).join("")}</ul>${pagination}`;
}
function detail({
  code = "881", modalidade = "ALUGUEL / VENDA", price = "R$ 10.000,75 / M\u00eas",
  tipo = "Loja", bairro = "Centro", cidade = "Ub\u00e1", uf = "MG", area = "500 Mts\u00b2",
} = {}) {
  return `<div class="single-property"><h2 class="page-title"><span class="location">${tipo} - Rua Um, 10 - ${bairro}, ${cidade} / ${uf}</span></h2>
    <span class="label-info">${modalidade}</span><span class="label-success">${price}</span>
    <div class="property-amenities"><span class="area"><strong>C\u00d3D:</strong><br>${code}</span>
    <span class="area"><strong>\u00c1rea</strong><br>${area}</span>
    <span class="baths"><strong>Banheiros</strong><br>-</span>
    <span class="beds"><strong>Quartos</strong><br>2</span>
    <span class="parking"><strong>Vagas de Garagem</strong><br>0</span></div>
    <div id="description">8 banheiros e 90 quartos na narrativa nao alteram dados estruturados.</div></div>
    <aside><div class="property-amenities"><span class="beds"><strong>99</strong></span></div></aside>`;
}
const item = options => extrairListagemArtolex(listing(options), "locacao").imoveis[0];

test("rotas GET separam finalidades e paginas e bloqueiam filtros adicionais", () => {
  validarUrlArtolex(project.urlVendas, "venda");
  validarUrlArtolex(project.urlLocacao, "locacao");
  validarUrlArtolex(`${project.urlLocacao}&pg=3`, "locacao", 3);
  for (const url of [
    project.urlVendas, project.urlLocacao + "&cidade=Uba", project.urlLocacao + "&pg=2",
    project.urlLocacao + "&interesse=comprar", project.urlLocacao + "#x",
    project.urlLocacao.replace("www.", ""), project.urlLocacao.replace("busca", "locacao"),
  ]) assert.throws(() => validarUrlArtolex(url, "locacao"), /Rota fora/);
  assert.throws(() => validarUrlArtolex(project.urlVendas, "outro"), /Negociacao/);
});

test("cada finalidade recebe somente o preco correspondente e ausencia vira zero", () => {
  const dual = "ALUGUEL / VENDA";
  assert.equal(precoArtolex("R$ 10.000,75 / M\u00eas", "locacao", dual, "881"), 10000.75);
  assert.equal(precoArtolex("R$ 10.000,75 / M\u00eas", "venda", dual, "881"), 0);
  assert.equal(precoArtolex("R$ 900.000,75", "venda", dual, "881"), 900000.75);
  assert.equal(precoArtolex("R$ 900.000,75", "locacao", dual, "881"), 0);
  assert.equal(precoArtolex("R$ 900,75", "locacao", "ALUGUEL", "30"), 900.75);
  assert.equal(precoArtolex("R$ 0,00 / M\u00eas", "locacao", dual, "881"), 0);
  for (const mode of ["venda", "locacao"]) assert.equal(precoArtolex("(A COMBINAR)", mode, dual, "830"), 0);
  for (const value of ["", "R$ 1,2", "R$ 1,234", "R$ 1.23,00", "R$ 1.000,00 / Ano"]) {
    assert.throws(() => precoArtolex(value, "locacao", dual, "881"), /Preco invalido/);
  }
  assert.throws(() => precoArtolex("R$ 100,00", "venda", "ALUGUEL", "1"), /fora da finalidade/);
});

test("listagem completa confere paginas, identidade, modalidade e campos numericos", () => {
  const parsed = extrairListagemArtolex(listing(), "venda");
  assert.equal(parsed.paginas, 1);
  assert.equal(parsed.imoveis[0].codigoBase, "881");
  assert.equal(parsed.imoveis[0].linkReal, `${origin}/?a=ver&id=881`);
  assert.equal(parsed.imoveis[0].areaValor, 500);
  assert.equal(parsed.imoveis[0].garagemValor, 0);
  assert.equal(parsed.imoveis[0].banheiroValor, null);
  const first = listing({ pg: 1, pages: 3, codes: Array.from({ length: 10 }, (_, i) => String(i + 1)) });
  assert.equal(extrairListagemArtolex(first, "locacao").paginas, 3);
  assert.equal(extrairListagemArtolex(listing({ pg: 3, pages: 3 }), "locacao", 3).paginas, 3);
  for (const html of [
    "<p>Indisponivel</p>", listing({ modalidade: "VENDA" }), listing({ codes: ["881", "881"] }),
    listing({ pg: 1, pages: 2 }), first.replace('interesse=alugar', 'interesse=comprar'),
    listing().replace("C\u00f3d: 881", "C\u00f3d: 880"),
    listing().replace('id=881', 'id=881&amp;cidade=1'),
    listing({ area: "muitos" }), listing({ codes: Array.from({ length: 11 }, (_, i) => String(i + 1)) }),
  ]) assert.throws(() => extrairListagemArtolex(html, "locacao"), /preservados/);
  assert.throws(() => extrairListagemArtolex(first, "locacao", 2), /Pagina ativa/);
});

test("detalhes retornam os vinte campos, endereco e zero sem inferencias", () => {
  const result = extrairDetalhesArtolex(detail(), item(), "locacao", now);
  assert.deepEqual(Object.keys(result), CABECALHO_SHEETS);
  assert.equal(result.preco, 10000.75);
  assert.equal(result.tipoImovel, "loja");
  assert.equal(result.cidade, "uba-mg");
  assert.equal(result.bairro, "centro");
  assert.equal(result.localizacao, "Rua Um, 10 - Centro, Ub\u00e1 / MG");
  assert.equal(result.dormitorioValor, 2);
  assert.equal(result.banheiroValor, null);
  assert.equal(result.areaValor, 500);
  assert.equal(result.garagemValor, 0);
  assert.equal(result.ambienteValor, null);
  assert.equal(result.elevadorValor, null);
  assert.equal(result.dataInclusao, now);
  assert.equal(result.linkFoto, `${origin}/fotos/2979.jpg`);
  const venda = extrairDetalhesArtolex(detail(), item(), "venda", now);
  assert.equal(venda.linkReal, result.linkReal);
  assert.equal(venda.preco, 0);
});

test("tipos fora do catalogo ficam vazios sem substituir pelo titulo", () => {
  const options = { tipo: "S\u00edtio / Ch\u00e1cara" };
  assert.equal(extrairDetalhesArtolex(detail(options), item(options), "locacao").tipoImovel, "");
  const desconhecida = { cidade: "Cidade inexistente" };
  assert.equal(extrairDetalhesArtolex(detail(desconhecida), item(desconhecida), "locacao").cidade, "");
});

test("area decimal, zeros e ausencia sao preservados", () => {
  for (const [source, expected] of [["1.200,50Mts\u00b2", 1200.5], ["0Mts\u00b2", 0], ["N/D", null]]) {
    assert.equal(extrairListagemArtolex(listing({ area: source }), "locacao").imoveis[0].areaValor, expected);
  }
  assert.equal(extrairDetalhesArtolex(detail({ area: "(N\u00e3o Dispon\u00edvel)" }), item({ area: "N/D" }), "locacao").areaValor, null);
});

test("detalhe errado ou divergente bloqueia coleta em vez de publicar parcial", () => {
  for (const html of [
    detail({ code: "880" }), detail({ tipo: "Casa" }), detail({ bairro: "Outro" }), detail({ cidade: "Outra" }),
    detail({ price: "R$ 50,00" }), detail({ modalidade: "ALUGUEL" }), detail({ area: "600 Mts\u00b2" }),
    detail().replace('class="beds"', 'class="ausente"'), detail().replace("<br>2</span>", "<br>9</span>"),
    detail() + detail(),
  ]) assert.throws(() => extrairDetalhesArtolex(html, item(), "locacao"), /preservados/);
});

function fixture({ mode = "locacao", failure = false, change = false, duplicate = false } = {}) {
  let closed = 0, reads = 0;
  const visits = [];
  const page = {
    goto: async url => { visits.push(url); return { ok: () => true }; },
    url: () => visits[0], close: async () => { closed++; },
    evaluate: async (fn, url) => {
      assert.equal(fn, fetchArtolex);
      visits.push(url);
      if (new URL(url).searchParams.get("a") === "ver") {
        if (failure) throw new Error("HTTP 500");
        return detail({ code: new URL(url).searchParams.get("id") });
      }
      assert.equal(new URL(url).searchParams.get("interesse"), mode === "venda" ? "comprar" : "alugar");
      const pg = Number(new URL(url).searchParams.get("pg"));
      if (pg === 1) reads++;
      const codes = pg === 1 ? Array.from({ length: 10 }, (_, i) => String(i + 1)) : [duplicate ? "1" : "11"];
      return listing({ mode, pg, pages: 2, codes, price: change && reads > 1 ? "R$ 100,00 / M\u00eas" : undefined });
    },
  };
  return { visits, newPage: async () => page, get closed() { return closed; } };
}

test("coletor percorre todas as paginas e detalhes em check e rele tudo no final", async () => {
  for (const mode of ["venda", "locacao"]) {
    const browser = fixture({ mode });
    const counts = [];
    const result = await coletarArtolex(browser, project, mode, {
      enriquecer: false, anteriores: new Map([[`${origin}/?a=ver&id=1`, { dataInclusao: "2020-01-01" }]]),
      onCount: async total => counts.push(total),
    });
    assert.equal(result.totalEsperado, 11);
    assert.equal(result.imoveis.length, 11);
    assert.equal(result.imoveis[0].dataInclusao, "2020-01-01");
    assert.equal(result.imoveis[0].preco, mode === "venda" ? 0 : 10000.75);
    assert.equal(browser.visits.filter(url => url.includes("a=ver")).length, 11);
    assert.equal(browser.visits.length, 16);
    assert.equal(browser.closed, 1);
    assert.deepEqual(counts, [11]);
  }
});

test("erros HTTP, duplicacoes entre paginas e alteracoes finais rejeitam coleta e fecham pagina", async () => {
  for (const options of [{ failure: true }, { change: true }, { duplicate: true }]) {
    const browser = fixture(options);
    await assert.rejects(coletarArtolex(browser, project, "locacao"), /HTTP 500|Listagem mudou|Identidades repetidas/);
    assert.equal(browser.closed, 1);
  }
});

test("transporte decodifica ISO-8859-1 sem perder acentos e rejeita HTTP e redirect", async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const url = project.urlVendas;
  const html = '<meta charset="iso-8859-1"><p>Ub\u00e1 / M\u00eas</p>';
  globalThis.fetch = async (target, options) => {
    assert.equal(target, url);
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.cache, "no-store");
    return {
      ok: true, url, headers: new Headers({ "content-type": "text/html" }),
      arrayBuffer: async () => Uint8Array.from(Buffer.from(html, "latin1")).buffer,
    };
  };
  assert.equal(await fetchArtolex(url), html);
  for (const changes of [{ ok: false, status: 500 }, { url: origin }]) {
    globalThis.fetch = async () => ({ ok: true, url, ...changes });
    await assert.rejects(fetchArtolex(url), /HTTP .*redirecionamento/);
  }
  globalThis.fetch = async () => ({
    ok: true, url, headers: new Headers(), arrayBuffer: async () => new TextEncoder().encode("<p>erro</p>").buffer,
  });
  await assert.rejects(fetchArtolex(url), /Codificacao ausente/);
});
