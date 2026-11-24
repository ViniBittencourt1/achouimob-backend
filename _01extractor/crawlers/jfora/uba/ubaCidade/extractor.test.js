import assert from "node:assert/strict";
import { test } from "node:test";
import {
  validarUrlCidade, fetchCidade, extrairListagemCidade, indisponivelCidade,
  parseImovelCidade, coletarCidade, resolverBairroCidade,
} from "./extractor.js";
import { project } from "./config.js";
import { CABECALHO_SHEETS } from "../../_utils/sheetsCampos.js";

const origin = "https://corretoracidadecarinho.com.br";
const now = "2026-11-06T22:00:00.000Z";
function row(id = 1, mode = "venda") {
  const status = mode === "venda" ? 31 : 30;
  return {
    id, type: "property", status: "publish", link: `${origin}/property/casa-${id}/`,
    title: "Casa &amp; Jardim", modified: now, statuses: [status], types: [58], cities: [63],
    terms: [
      { id: status, taxonomy: "property-status", slug: mode === "venda" ? "para-vender" : "para-alugar", name: mode === "venda" ? "Para Vender" : "Para Alugar" },
      { id: 58, taxonomy: "property-type", name: "Casa", slug: "casa" },
      { id: 63, taxonomy: "property-city", name: "Ub\u00e1 - MG", slug: "uba" },
    ],
    photo: `${origin}/foto.jpg`,
    meta: {
      price: "190000.75", price_prefix: "", price_postfix: "", size: "90", size_postfix: "m\u00b2",
      lot_size: "300", lot_size_postfix: "m\u00b2", bedrooms: "2", bathrooms: "1",
      garage: "0", id: `CCC-Im\u00f3vel n\u00b0${id}`, address: "",
    },
  };
}
function listing(rows, pg = 1, mode = "venda") {
  const selected = rows.slice((pg - 1) * 6, pg * 6);
  return `<div class="rh_pagination__stats">${(pg - 1) * 6 + 1} para ${Math.min(pg * 6, rows.length)} de ${rows.length} Im\u00f3veis</div>${
    selected.map(r => `<article class="rh_list_card"><span data-property-id="${r.id}"></span>
      <h3><a href="${r.link}">${r.title}</a></h3><span class="status">${mode === "venda" ? "Para Vender" : "Para Alugar"}</span></article>`).join("")
  }<article class="rh_prop_card"><span class="status">Outra finalidade em destaque</span></article>`;
}

test("URLs exigem finalidade e pagina corretas sem filtros adicionais", () => {
  validarUrlCidade(project.urlVendas, "venda");
  validarUrlCidade(project.urlLocacao, "locacao");
  validarUrlCidade(project.urlVendas.replace("/?", "/page/43/?"), "venda", 43);
  for (const url of [
    project.urlLocacao, project.urlVendas + "&cidade=uba", project.urlVendas + "&status=para-alugar",
    project.urlVendas + "#x", project.urlVendas.replace("https:", "http:"),
  ]) assert.throws(() => validarUrlCidade(url, "venda"), /Rota fora/);
  assert.throws(() => validarUrlCidade(project.urlVendas, "outro"), /Negociacao/);
});

test("HTML confere contagem bruta, intervalo, cards e finalidade sem incluir destaques", () => {
  const rows = Array.from({ length: 8 }, (_, i) => row(i + 1));
  assert.deepEqual(extrairListagemCidade(listing(rows), "venda"), {
    total: 8, ids: [1, 2, 3, 4, 5, 6], links: rows.slice(0, 6).map(r => r.link),
  });
  assert.deepEqual(extrairListagemCidade(listing(rows, 2), "venda", 2).ids, [7, 8]);
  for (const html of [
    "<p>erro</p>", listing(rows).replace("1 para 6", "1 para 5"),
    listing(rows).replace('data-property-id="1"', 'data-property-id="2"'),
    listing(rows).replace("Para Vender", "Para Alugar"),
    listing(rows).replace('class="rh_list_card"', 'class="fora"'),
    listing(rows).replace("de 8", "de 0"),
  ]) assert.throws(() => extrairListagemCidade(html, "venda"), /preservados/);
});

test("vendidos, alugados e indisponiveis sao excluidos inclusive com acentos, emojis e HTML", () => {
  for (const title of [
    "(VENDIDO) Casa", "(vendida) Casa", "\u274cALUGADO\u274c Apto",
    "(ALUGADA) Casa", "(&#10060;INDISPON\u00cdVEL&#10060;) Casa",
  ]) {
    assert.equal(indisponivelCidade(title), true);
    assert.equal(parseImovelCidade({ ...row(), title }, "venda"), null);
  }
  assert.equal(indisponivelCidade("Venda de casa disponivel para morar"), false);
});

test("API fornece vinte campos e preserva ausencias sem indicacao explicita de bairro", () => {
  const result = parseImovelCidade(row(), "venda", now);
  assert.deepEqual(Object.keys(result), CABECALHO_SHEETS);
  assert.equal(result.titulo, "Casa & Jardim");
  assert.equal(result.preco, 190000.75);
  assert.equal(result.cidade, "uba-mg");
  assert.equal(result.tipoImovel, "casa");
  assert.equal(result.bairro, "");
  assert.equal(result.localizacao, "Ub\u00e1 - MG");
  assert.equal(result.dormitorioValor, 2);
  assert.equal(result.banheiroValor, 1);
  assert.equal(result.garagemValor, 0);
  assert.equal(result.areaValor, 90);
  assert.equal(result.ambienteValor, null);
  assert.equal(result.elevadorValor, null);
  assert.equal(result.codigoBase, "CCC-Im\u00f3vel n\u00b01");
  assert.equal(result.dataInclusao, now);
});

test("bairro usa indicacao explicita no titulo ou link e somente catalogo da cidade", () => {
  const linkReal = `${origin}/property/a-liberdade-de-construir-do-seu-jeito-no-palmeiras/`;
  assert.equal(resolverBairroCidade({ cidade: "uba-mg", linkReal }), "palmeiras");
  assert.equal(resolverBairroCidade({ cidade: "uba-mg", titulo: "Lote NO PALMEIRAS" }), "palmeiras");
  assert.equal(resolverBairroCidade({ cidade: "uba-mg", titulo: "Bairro atual: Palmeiras" }), "palmeiras");
  assert.equal(resolverBairroCidade({ cidade: "uba-mg", titulo: "Casa na Palmeiras" }), "palmeiras");
  assert.equal(resolverBairroCidade({ cidade: "uba-mg", endereco: "Palmeiras" }), "palmeiras");
  assert.equal(resolverBairroCidade({ cidade: "cidade-inexistente", linkReal }), "");
  assert.equal(resolverBairroCidade({ cidade: "merces-mg", linkReal }), "");
  assert.equal(resolverBairroCidade({ cidade: "", linkReal }), "");
  for (const mode of ["venda", "locacao"]) {
    const input = { ...row(1, mode), link: linkReal };
    assert.equal(parseImovelCidade(input, mode).bairro, "palmeiras");
    assert.equal(parseImovelCidade(input, mode).localizacao, "Ub\u00e1 - MG");
  }
});

test("bairro nao usa palavra solta, proximidade, outra cidade ou trechos parciais", () => {
  for (const titulo of [
    "Casa Palmeiras", "Casa em Uba", "Casa no bairro desconhecido",
    "Casa proxima ao bairro Palmeiras", "Casa perto do bairro Palmeiras",
  ]) {
    assert.equal(resolverBairroCidade({ cidade: "uba-mg", titulo }), "", titulo);
  }
  assert.equal(resolverBairroCidade({ cidade: "uba-mg", linkReal: `${origin}/property/casa-no-palmeirass/` }), "");
  assert.throws(() => resolverBairroCidade({ cidade: "uba-mg", linkReal: "https://outro.example/property/no-palmeiras/" }), /Link invalido/);
});

test("bairro conflitante fica vazio e endereco exato tem prioridade", () => {
  const linkReal = `${origin}/property/casa-no-centro/`;
  assert.equal(resolverBairroCidade({ cidade: "uba-mg", titulo: "Casa no Palmeiras", linkReal }), "");
  assert.equal(resolverBairroCidade({ cidade: "uba-mg", endereco: "Palmeiras", titulo: "Casa no Centro", linkReal }), "palmeiras");
  assert.equal(resolverBairroCidade({ cidade: "uba-mg", titulo: "Casa no Jardim Gloria" }), "jardim-gloria");
});

test("tipos sem indicacao no titulo e cidades desconhecidas permanecem vazios", () => {
  const unknown = row();
  unknown.link = `${origin}/property/imovel-1/`;
  unknown.title = "Imovel sem categoria";
  unknown.terms[1].name = "S\u00edtio e Ch\u00e1caras";
  unknown.terms[2].name = "Ubari-Ub\u00e1 - MG";
  const result = parseImovelCidade(unknown, "venda");
  assert.equal(result.tipoImovel, "");
  assert.equal(result.cidade, "");
  const missing = row();
  missing.link = `${origin}/property/imovel-1/`;
  missing.title = "Imovel sem categoria";
  missing.types = []; missing.cities = [];
  missing.terms = missing.terms.filter(t => t.taxonomy === "property-status");
  assert.equal(parseImovelCidade(missing, "venda").tipoImovel, "");
  assert.equal(parseImovelCidade(missing, "venda").cidade, "");
  const ambiguous = row();
  ambiguous.link = `${origin}/property/imovel-1/`;
  ambiguous.title = "Imovel sem categoria";
  ambiguous.types.push(59);
  ambiguous.terms.push({ id: 59, name: "Apartamento", taxonomy: "property-type" });
  assert.equal(parseImovelCidade(ambiguous, "venda").tipoImovel, "");
});

test("tipo vazio consulta inicio do titulo no catalogo para venda e locacao", () => {
  for (const mode of ["venda", "locacao"]) {
    for (const title of [
      "Ch\u00e1cara Condom\u00ednio Rural para Venda, terreno 800 m\u00b2",
      "Ch&#225;cara para Loca\u00e7\u00e3o, Ub\u00e1 / MG",
      "\u{1F33F} CH\u00c1CARA \u00c0 VENDA EM GUIDOVAL \u2013 MG \u2013 \u00c0 5 KM DA PRA\u00c7A DE GUIDOVAL \u{1F33F}",
      " \u{1F3E1}\uFE0F \u201cCh\u00e1cara\u201d para Venda, terreno 800 m\u00b2",
      "\u201cUM LUGAR ONDE O AMOR E O LAR SE TORNAM INSEPAR\u00c1VEIS\u201d. CH\u00c1CARA EM ASTOLFO DUTRA",
    ]) {
      const input = row(1, mode);
      input.title = title;
      input.terms[1].name = "Categoria desconhecida";
      const result = parseImovelCidade(input, mode);
      assert.equal(result.tipoImovel, "granja");
      assert.deepEqual(Object.keys(result), CABECALHO_SHEETS);
      assert.equal(result.cidade, "uba-mg");
      assert.equal(result.preco, 190000.75);
    }
    const missing = row(1, mode);
    missing.types = [];
    missing.terms = missing.terms.filter(t => t.taxonomy !== "property-type");
    missing.title = "Casa Comercial para Venda";
    assert.equal(parseImovelCidade(missing, mode).tipoImovel, "casa-comercial");
  }
});

test("tipo estruturado reconhecido prevalece e fallback nao usa medidas ou localizacao", () => {
  const input = row();
  input.link = `${origin}/property/imovel-1/`;
  input.title = "Ch\u00e1cara para Venda, terreno 800 m\u00b2";
  assert.equal(parseImovelCidade(input, "venda").tipoImovel, "casa");
  input.terms[1].name = "Categoria desconhecida";
  input.title = "Imovel para Venda, bairro Casa, terreno 800 m\u00b2";
  assert.equal(parseImovelCidade(input, "venda").tipoImovel, "");
  input.title = "Casamento para Venda";
  assert.equal(parseImovelCidade(input, "venda").tipoImovel, "");
  input.title = "Oportunidade: Casa e Apartamento";
  assert.equal(parseImovelCidade(input, "venda").tipoImovel, "");
  input.title = "Oportunidade, bairro Casa, terreno 800 m\u00b2";
  assert.equal(parseImovelCidade(input, "venda").tipoImovel, "");
  input.title = "Oportunidade: Casa Comercial";
  assert.equal(parseImovelCidade(input, "venda").tipoImovel, "casa-comercial");
});

test("tipo ainda vazio consulta caminho do link por ultimo em venda e locacao", () => {
  for (const mode of ["venda", "locacao"]) {
    const input = row(1, mode);
    input.title = "O LUGAR PERFEITO PARA RELAXAR EM DIAMANTE";
    input.terms[1].name = "Categoria desconhecida";
    input.link = `${origin}/property/vende-se-excelente-chacara-em-diamante-em-uba-mg/`;
    assert.equal(parseImovelCidade(input, mode).tipoImovel, "granja");
    input.link = `${origin}/property/vende-se-ch%C3%A1cara/`;
    assert.equal(parseImovelCidade(input, mode).tipoImovel, "granja");
    input.title = "Apartamento para Venda";
    assert.equal(parseImovelCidade(input, mode).tipoImovel, "apartamento");
    input.terms[1].name = "Casa";
    assert.equal(parseImovelCidade(input, mode).tipoImovel, "casa");
    input.terms[1].name = "Categoria desconhecida";
    input.title = "Oportunidade";
    input.link = `${origin}/property/casa-e-apartamento/`;
    assert.equal(parseImovelCidade(input, mode).tipoImovel, "");
    input.link = `${origin}/property/chacaramento/`;
    assert.equal(parseImovelCidade(input, mode).tipoImovel, "");
  }
});

test("tipos especificos prevalecem sobre qualificadores comercial e rural nos titulos e links", () => {
  for (const mode of ["venda", "locacao"]) {
    for (const [title, slug, expected] of [
      ["Vende-se Excelente ch\u00e1cara em Divin\u00e9sia (pr\u00f3ximo pousada canarinhos)", "vende-se-excelente-chacara-em-divinesia-proximo-pousada-canarinhos", "granja"],
      ["Vendo \u00d3TIMAS ch\u00e1caras no condom\u00ednio Portal da Serra, Ub\u00e1 x Divin\u00e9sia Mg", "vendo-otimas-chacaras-no-condominio-portal-da-serra-uba-x-divinesia-mg", "granja"],
      ["TODO GRANDE FUTURO. MAIS QUE UM IM\u00d3VEL, UMA TELA EM BRANCO. COBERTURA COMERCIAL NO CENTRO", "terraco-a-venda-no-centro-de-uba-mg", "cobertura"],
      ["EXCELENTE GALP\u00c3O COMERCIAL \u00c0 VENDA NO BAIRRO SANTOS DUMONT", "excelente-galpao-comercial-a-venda-no-bairro-santos-dumont-uba-mg", "galpao"],
      ["EXCELENTE CONDOM\u00cdNIO RURAL, CH\u00c1CARA DO CANTO \u00c0 VENDA NA RODOVIA UB\u00c1", "excelente-condominio-rural-chacara-do-canto-a-venda-na-rodovia-uba-x-visconde-do-rio-branco", "granja"],
    ]) {
      const input = row(1, mode);
      input.terms[1].name = "Categoria desconhecida";
      input.title = title;
      input.link = `${origin}/property/${slug}/`;
      assert.equal(parseImovelCidade(input, mode).tipoImovel, expected);
      if (expected !== "cobertura") {
        input.title = "Oportunidade";
        assert.equal(parseImovelCidade(input, mode).tipoImovel, expected);
      }
    }
  }
});

test("preco ausente vira zero, preco R$ 1 e centavos preservados e outra finalidade nao e copiada", () => {
  for (const mode of ["venda", "locacao"]) {
    const r = row(1, mode);
    r.meta.price = "";
    assert.equal(parseImovelCidade(r, mode).preco, 0);
    r.meta.price = "1";
    assert.equal(parseImovelCidade(r, mode).preco, 1);
    r.meta.price = "1500.75";
    assert.equal(parseImovelCidade(r, mode).preco, 1500.75);
    r.meta.price_postfix = mode === "venda" ? "por m\u00eas" : "\u00c0 VENDA";
    assert.equal(parseImovelCidade(r, mode).preco, 0);
  }
});

test("areas priorizam construida; formato aproximado estruturado e normalizado sem calcular dimensoes", () => {
  const r = row();
  for (const [source, expected] of [["0", 0], ["90.5", 90.5], ["APROX. 324,70", 324.7], ["Aprox. 5.899", 5899], ["10x15", null]]) {
    r.meta.size = source;
    assert.equal(parseImovelCidade(r, "venda").areaValor, expected);
  }
  r.meta.size = "";
  r.meta.lot_size = "264,50";
  assert.equal(parseImovelCidade(r, "venda").areaValor, 264.5);
  r.meta.lot_size_postfix = "hectares";
  assert.equal(parseImovelCidade(r, "venda").areaValor, null);
  r.meta.garage = "sim";
  assert.equal(parseImovelCidade(r, "venda").garagemValor, null);
  r.meta.bedrooms = "";
  assert.equal(parseImovelCidade(r, "venda").dormitorioValor, null);
});

test("identidade, status, taxonomia e preco invalidos interrompem a coleta", () => {
  for (const mutate of [
    r => { r.id = 0; }, r => { r.status = "draft"; }, r => { r.type = "post"; },
    r => { r.link = "https://outro.example/property/casa/"; },
    r => { r.statuses = [30]; }, r => { r.terms[0].slug = "para-alugar"; },
    r => { r.terms.pop(); }, r => { r.meta.id = ""; },
    r => { r.meta.price = "190.000,00"; }, r => { r.photo = "javascript:erro"; },
    r => { r.terms.push(r.terms[1]); },
  ]) {
    const r = row(); mutate(r);
    assert.throws(() => parseImovelCidade(r, "venda"), /preservados/);
  }
});

function fixture({ mode = "venda", total = 102, failure, change = false } = {}) {
  const rows = Array.from({ length: total }, (_, i) => row(i + 1, mode));
  rows[0].title = "(VENDIDO) Casa";
  let closed = 0, rounds = 0;
  const visits = [];
  const page = {
    goto: async url => { visits.push(url); return { ok: () => true }; },
    url: () => visits[0], close: async () => { closed++; },
    evaluate: async (fn, input) => {
      assert.equal(fn, fetchCidade);
      visits.push(input.url);
      if (failure === "http") throw new Error("HTTP 500");
      const url = new URL(input.url);
      if (input.json) {
        assert.equal(url.searchParams.get("im\u00f3vel-estados"), mode === "venda" ? "31" : "30");
        const pg = Number(url.searchParams.get("page"));
        if (pg === 1) rounds++;
        const selected = structuredClone(rows.slice((pg - 1) * 100, pg * 100));
        if (change && rounds > 1 && selected.length) selected[0].meta.price = "500";
        if (failure === "duplicate" && pg === 2) selected[0] = rows[0];
        if (failure === "partial") selected.pop();
        return {
          rows: selected, total: failure === "zero" ? "0" : String(total),
          pages: String(Math.ceil(total / 100)),
        };
      }
      const pg = Number(url.pathname.match(/page\/(\d+)/)?.[1] ?? 1);
      const html = listing(rows, pg, mode);
      return { html: failure === "html" ? html.replace("data-property-id=\"1\"", "data-property-id=\"999\"") : html };
    },
  };
  return { rows, visits, newPage: async () => page, get closed() { return closed; } };
}

test("coletor percorre API toda, confere HTML inicio/fim, relê dados e conta somente ativos", async () => {
  for (const mode of ["venda", "locacao"]) {
    const browser = fixture({ mode });
    const counts = [];
    const result = await coletarCidade(browser, project, mode, {
      enriquecer: false, onCount: async total => counts.push(total),
      anteriores: new Map([[row(2).link, { dataInclusao: "2020-01-01" }]]),
    });
    assert.equal(result.totalSite, 102);
    assert.equal(result.totalEsperado, 101);
    assert.equal(result.imoveis.length, 101);
    assert.deepEqual(result.excluidos, [1]);
    assert.equal(result.imoveis[0].dataInclusao, "2020-01-01");
    assert.deepEqual(counts, [101]);
    assert.equal(browser.visits.filter(url => url.includes("/wp-json/")).length, 4);
    assert.equal(browser.closed, 1);
  }
});

test("coletor aplica fallback do link em venda e locacao sem requisicoes adicionais", async () => {
  for (const mode of ["venda", "locacao"]) {
    const browser = fixture({ mode, total: 3 });
    browser.rows[1].link = `${origin}/property/lote-no-palmeiras/`;
    const result = await coletarCidade(browser, project, mode);
    assert.equal(result.imoveis[0].bairro, "palmeiras");
    assert.equal(result.imoveis[1].bairro, "");
    assert.equal(browser.visits.filter(url => url.includes("/property/")).length, 0);
    assert.equal(result.imoveis.length, 2);
    assert.equal(browser.closed, 1);
  }
});

test("falhas de HTTP, total zero, duplicacoes, paginas parciais, HTML divergente e mudancas preservam base", async () => {
  for (const options of [
    { failure: "http" }, { failure: "zero" }, { failure: "duplicate" },
    { failure: "partial" }, { failure: "html" }, { change: true },
  ]) {
    const browser = fixture(options);
    let counted = false;
    await assert.rejects(coletarCidade(browser, project, "venda", {
      onCount: async () => { counted = true; },
    }), /HTTP 500|preservados/);
    assert.equal(counted, false);
    assert.equal(browser.closed, 1);
  }
  const empty = fixture({ total: 1 });
  await assert.rejects(coletarCidade(empty, project, "venda"), /Base ativa vazia/);
});

test("transporte projeta apenas campos necessarios, preserva embeds e rejeita redirect/HTTP", async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const url = `${origin}/wp-json/wp/v2/properties`;
  globalThis.fetch = async (target, options) => {
    assert.equal(target, url);
    assert.ok(options.signal instanceof AbortSignal);
    return {
      ok: true, url, headers: new Headers({ "x-wp-total": "1", "x-wp-totalpages": "1" }),
      json: async () => [{
        id: 1, type: "property", status: "publish", link: row().link, title: { rendered: "Casa" },
        "im\u00f3vel-estados": [31], "im\u00f3vel-tipos": [58], "im\u00f3veis-cidades": [63],
        property_meta: { REAL_HOMES_property_price: "100", unused_field: "must-not-return" },
        _embedded: { "wp:term": [row().terms], "wp:featuredmedia": [{ source_url: row().photo }] },
      }],
    };
  };
  const result = await fetchCidade({ url, json: true });
  assert.equal(result.total, "1");
  assert.equal(result.rows[0].meta.price, "100");
  assert.equal(result.rows[0].photo, row().photo);
  assert.equal(JSON.stringify(result).includes("must-not-return"), false);
  for (const changes of [{ ok: false, status: 500 }, { url: origin }]) {
    globalThis.fetch = async () => ({ ok: true, url, ...changes });
    await assert.rejects(fetchCidade({ url }), /HTTP .*redirecionamento/);
  }
  globalThis.fetch = async () => ({ ok: true, url, json: async () => ({ error: "bad" }) });
  await assert.rejects(fetchCidade({ url, json: true }), /API sem lista/);
});
