import assert from "node:assert/strict";
import { test } from "node:test";
import {
  validarUrlNogueira, fetchNogueira, lerColecaoNogueira, validarRegistrosNogueira,
  precoNogueira, localizacaoNogueira, extrairDetalhesNogueira, coletarNogueira,
} from "./extractor.js";
import { project } from "./config.js";
import { CABECALHO_SHEETS } from "../../_utils/sheetsCampos.js";

const origin = "https://nogueiracarvalhoimoveis.com.br";
const tipos = new Map([[13, "Casas"], [15, "Lotes"], [61, "Empreendimentos"], [14, "S\u00edtios e Ch\u00e1caras"]]);
const now = "2026-11-06T20:00:00.000Z";
function row(id = 6970, status = 16) {
  return {
    id, link: `${origin}/imoveis/casa-${id}/`, title: { rendered: "Casa &amp; jardim" },
    type: "imoveis", status: "publish", "status-do-imovel": [status],
    "_situacao-do-imovel": [65], "tipo-do-imovel": [13],
  };
}
const item = (id = 6970, status = 16) => validarRegistrosNogueira([row(id, status)], status === 16 ? "venda" : "locacao", tipos)[0];
function detail({ id = 6970, status = "Para Vender", title = "Casa &amp; jardim", tipo = "Casas", fields = {} } = {}) {
  const values = {
    d9d2473: title, a30e6b9: "R$ 360.000,75", ce8f6c7: "", b98874e: "Venda R$ 360.000,75; 99 quartos na narrativa.",
    "1984da0": "Rua Um,", "561d8ca": "n\u00ba 10", "06d44a1": "UB\u00c1", "1b048ff": "MG",
    ab2bea3: "Centro", "9c1ab7a": "3", "9c5efda": "2", "3853eab": "m2", "51b5bb1": "1.200,50 m2",
    "34b866d": "0", ...fields,
  };
  const widgets = Object.entries(values).map(([key, text]) =>
    `<div data-id="${key}"><div class="jet-listing-dynamic-field__content">${text}</div></div>`).join("");
  return `<body class="single-imoveis postid-${id}">${widgets}${widgets}
    <div data-id="85795dc"><div class="jet-listing-dynamic-terms">${status}</div></div>
    <div data-id="774db6b"><div class="jet-listing-dynamic-terms">${tipo}</div></div>
    <img class="swiper-slide-image" src="data:image/svg+xml;base64,x" data-src="${origin}/foto.jpg"></body>`;
}
const response = (rows, total = rows.length, pages = Math.ceil(total / 100)) =>
  ({ body: JSON.stringify(rows), total: String(total), pages: String(pages) });

test("rota compartilhada exige origem e ausencia de filtros adicionais", () => {
  validarUrlNogueira(project.urlVendas);
  assert.equal(project.urlVendas, project.urlLocacao);
  for (const url of [project.urlVendas + "?cidade=1", project.urlVendas + "#x", project.urlVendas.replace("https:", "http:")]) {
    assert.throws(() => validarUrlNogueira(url), /Rota inesperada/);
  }
});

test("API paginada confere cabecalhos, tamanho, estabilidade e identidades", async () => {
  const rows = Array.from({ length: 101 }, (_, index) => row(index + 1));
  const visits = [];
  const result = await lerColecaoNogueira(async url => {
    visits.push(url);
    return response(new URL(url).searchParams.get("page") === "1" ? rows.slice(0, 100) : rows.slice(100), 101, 2);
  }, "imoveis?status-do-imovel=16");
  assert.deepEqual(result, rows);
  assert.equal(visits.length, 2);
  assert.ok(visits.every(url => new URL(url).searchParams.get("status-do-imovel") === "16"));
  for (const invalid of [
    { ...response([row()]), total: null }, response([], 0, 0), response([row()], 2, 1),
    response([row(), row()], 2), response([row()], 1, 2),
  ]) await assert.rejects(lerColecaoNogueira(async () => invalid, "imoveis"), /preservados/);
  await assert.rejects(lerColecaoNogueira(async url =>
    new URL(url).searchParams.get("page") === "1"
      ? response(rows.slice(0, 100), 101, 2) : response([row(101)], 102, 2), "imoveis"), /Contagem mudou/);
});

test("finalidade, situacao ativa e identidade sao obrigatorias, sem inferencia pelo titulo", () => {
  assert.equal(validarRegistrosNogueira([row(1, 11)], "locacao", tipos)[0].titulo, "Casa & jardim");
  for (const changes of [
    { "status-do-imovel": [11] }, { "_situacao-do-imovel": [66] }, { status: "draft" },
    { "tipo-do-imovel": [999] }, { link: `${origin}/filtrando-imoveis/` },
    { link: "https://outro.example/imoveis/casa/" },
  ]) assert.throws(() => validarRegistrosNogueira([{ ...row(), ...changes }], "venda", tipos), /preservados/);
  assert.throws(() => validarRegistrosNogueira([row(), row()], "venda", tipos), /preservados/);
  assert.throws(() => precoNogueira("R$ 1,00", "outro", "", 1), /Negociacao/);
});

test("aluguel nunca usa o preco geral/de venda; apenas aluguel explicitamente rotulado", () => {
  assert.equal(precoNogueira("R$ 360.000,00", "locacao", "Casa a venda. Valor R$ 360.000,00", 1), null);
  assert.equal(precoNogueira("R$ 360.000,00", "locacao", "Aluguel: R$ 1.500,75", 1), 1500.75);
  assert.equal(precoNogueira("R$ 360.000,00", "locacao", "Loca\u00e7\u00e3o mensal: R$ 0,00", 1), 0);
  assert.throws(() => precoNogueira("", "locacao", "Aluguel: R$ 1.000,00 Aluguel: R$ 2.000,00", 1), /Mais de um/);
  assert.equal(precoNogueira("R$ 360.000,75", "venda", "", 1), 360000.75);
  for (const invalid of ["R$ 1,2", "", "R$ 1.23,00"]) assert.throws(() => precoNogueira(invalid, "venda", "", 1), /Preco invalido/);
});

test("detalhes preservam vinte campos, zeros e ausencia sem inferir a narrativa", () => {
  const result = extrairDetalhesNogueira(detail(), item(), "venda", now);
  assert.deepEqual(Object.keys(result).sort(), [...CABECALHO_SHEETS].sort());
  assert.equal(result.codigoBase, "6970");
  assert.equal(result.preco, 360000.75);
  assert.equal(result.cidade, "uba-mg");
  assert.equal(result.bairro, "centro");
  assert.equal(result.localizacao, "Rua Um, 10, Centro, UB\u00c1/MG");
  assert.equal(result.tipoImovel, "casa");
  assert.equal(result.areaValor, 1200.5);
  assert.equal(result.dormitorioValor, 3);
  assert.equal(result.garagemValor, 0);
  assert.equal(result.ambienteValor, null);
  assert.equal(result.elevadorValor, null);
  assert.equal(result.linkFoto, `${origin}/foto.jpg`);
  assert.equal(extrairDetalhesNogueira(detail({ fields: { ce8f6c7: "C002", "3853eab": "0 m2" } }), item(), "venda").areaValor, 0);
});

test("tipos sem correspondencia exata no catalogo ficam vazios sem substituir pelo titulo", () => {
  for (const tipoFonte of ["Empreendimentos", "S\u00edtios e Ch\u00e1caras", "Lotes"]) {
    const titulo = "Imovel sem categoria";
    const result = extrairDetalhesNogueira(detail({ tipo: tipoFonte, title: titulo }), { ...item(), tipoFonte, titulo, linkReal: `${origin}/imoveis/imovel-6970/` }, "venda");
    assert.equal(result.tipoImovel, "");
  }
});

test("tipo complementar usa titulo e depois link com plurais, qualificadores e proximidade", () => {
  for (const mode of ["venda", "locacao"]) {
    for (const [titulo, slug, expected] of [
      ["Oportunidade", "vende-se-excelente-chacara-em-divinesia-proximo-pousada-canarinhos", "granja"],
      ["Oportunidade", "vendo-otimas-chacaras-no-condominio-portal-da-serra", "granja"],
      ["Oportunidade", "excelente-galpao-comercial-a-venda", "galpao"],
      ["Oportunidade", "lote-a-venda-no-condominio", "terreno"],
      ["Oportunidade", "vende-se-ch%C3%A1cara", "granja"],
      ["Uma escolha especial. COBERTURA COMERCIAL NO CENTRO", "terraco-a-venda", "cobertura"],
      ["Oportunidade", "casa-e-apartamento", ""],
      ["Oportunidade", "chacaramento", ""],
    ]) {
      const property = {
        ...item(6970, mode === "venda" ? 16 : 11), titulo,
        tipoFonte: "Categoria desconhecida", linkReal: `${origin}/imoveis/${slug}/`,
      };
      const html = detail({ title: titulo, tipo: property.tipoFonte, status: mode === "venda" ? "Para Vender" : "Para Alugar" });
      assert.equal(extrairDetalhesNogueira(html, property, mode).tipoImovel, expected, slug);
    }
  }
});

test("tipo vazio consulta Lote no inicio do titulo sem substituir tipo estruturado", () => {
  for (const mode of ["venda", "locacao"]) {
    const titulo = "Lote \u00e0 Venda no Condom\u00ednio Portal das Mangueiras em Ub\u00e1-MG | 420m\u00b2";
    const property = { ...item(6970, mode === "venda" ? 16 : 11), titulo, tipoFonte: "Lotes" };
    const html = detail({ title: titulo, tipo: "Lotes", status: mode === "venda" ? "Para Vender" : "Para Alugar" });
    assert.equal(extrairDetalhesNogueira(html, property, mode).tipoImovel, "terreno");
    property.tipoFonte = "Casas";
    assert.equal(extrairDetalhesNogueira(html.replace("Lotes", "Casas"), property, mode).tipoImovel, "casa");
  }
});

test("cidade estruturada prevalece sobre taxonomia generica e desconhecidas ficam vazias", () => {
  assert.equal(localizacaoNogueira("Divin\u00e9sia", "MG", "", "", 1).cidade, "divinesia-mg");
  assert.equal(localizacaoNogueira("Cidade inexistente", "MG", "", "", 1).cidade, "");
  assert.equal(localizacaoNogueira("", "", "", "", 1).cidade, "");
  const result = extrairDetalhesNogueira(detail({ fields: { "06d44a1": "", "1b048ff": "", ab2bea3: "" } }), item(), "venda");
  assert.equal(result.cidade, "");
  assert.equal(result.bairro, "");
});

test("bairro ausente usa titulo ou link catalogado na cidade em venda e locacao", () => {
  for (const mode of ["venda", "locacao"]) {
    const status = mode === "venda" ? 16 : 11;
    for (const title of ["Casa no Palmeiras", "Casa com jardim"]) {
      const property = { ...item(6970, status), titulo: title, linkReal: `${origin}/imoveis/casa-no-palmeiras/` };
      const html = detail({ title, status: mode === "venda" ? "Para Vender" : "Para Alugar", fields: { ab2bea3: "" } });
      const result = extrairDetalhesNogueira(html, property, mode);
      assert.equal(result.bairro, "palmeiras");
      assert.equal(result.localizacao, "Rua Um, 10, UB\u00c1/MG");
    }
  }
});

test("bairro estruturado tem prioridade e aliases resolvem dentro da cidade", () => {
  const property = { ...item(), titulo: "Casa no Palmeiras", linkReal: `${origin}/imoveis/casa-no-palmeiras/` };
  assert.equal(extrairDetalhesNogueira(detail({ title: property.titulo }), property, "venda").bairro, "centro");
  assert.equal(extrairDetalhesNogueira(detail({ fields: { ab2bea3: "chiquito-gazolla" } }), item(), "venda").bairro, "chiquito-gazola");
});

test("bairro nao usa cidade desconhecida, proximidade, fragmentos ou candidatos conflitantes", () => {
  for (const [title, link, fields] of [
    ["Casa no Palmeiras", "casa-no-palmeiras", { "06d44a1": "Cidade inexistente" }],
    ["Casa proxima ao bairro Palmeiras", "casa", {}],
    ["Casa no Palmeirass", "casa-no-palmeirass", {}],
    ["Casa no Palmeiras", "casa-no-centro", {}],
    ["Casa Palmeiras", "casa", {}],
  ]) {
    const property = { ...item(), titulo: title, linkReal: `${origin}/imoveis/${link}/` };
    const html = detail({ title, fields: { ab2bea3: "", ...fields } });
    assert.equal(extrairDetalhesNogueira(html, property, "venda").bairro, "", title);
  }
  assert.equal(extrairDetalhesNogueira(detail({ fields: { ab2bea3: "Nao catalogado" } }), item(), "venda").bairro, "nao-catalogado");
});

test("detalhe errado, finalidade, tipo, campos divergentes e numeros invalidos bloqueiam coleta", () => {
  for (const html of [
    detail({ id: 2 }), detail({ status: "Para Alugar" }), detail({ tipo: "Lotes" }),
    detail({ title: "Outro imovel" }), detail({ fields: { "9c1ab7a": "muitos" } }),
    detail().replaceAll('data-id="06d44a1"', 'data-id="ausente"'),
    detail().replace('>3</div>', '>99</div>'),
    detail().replace('data-src="' + origin + '/foto.jpg"', 'data-src="javascript:erro"'),
  ]) assert.throws(() => extrairDetalhesNogueira(html, item(), "venda"), /preservados/);
});

test("tipografia WordPress nao altera identidade, mas titulo diferente continua bloqueado", () => {
  const result = extrairDetalhesNogueira(detail({ title: "Lote 12x29" }), { ...item(), titulo: "Lote 12\u00d729" }, "venda");
  assert.equal(result.titulo, "Lote 12\u00d729");
});

function fixture({ mode = "venda", failure = false, change = false } = {}) {
  let closed = 0, reads = 0;
  const status = mode === "venda" ? 16 : 11;
  const page = {
    goto: async () => ({ ok: () => true }),
    url: () => project.urlVendas,
    close: async () => { closed++; },
    evaluate: async (fn, url) => {
      assert.equal(fn, fetchNogueira);
      if (url.includes("/tipo-do-imovel?")) return response([{ id: 13, name: "Casas" }]);
      if (url.includes("/wp-json/")) {
        assert.equal(new URL(url).searchParams.get("status-do-imovel"), String(status));
        reads++;
        const record = row();
        record["status-do-imovel"] = [status];
        if (change && reads > 1) record.title.rendered = "Mudou";
        return response([record]);
      }
      if (failure) throw new Error("HTTP 500");
      return { body: detail({ status: status === 16 ? "Para Vender" : "Para Alugar" }) };
    },
  };
  return { newPage: async () => page, get closed() { return closed; } };
}

test("coleta ambas finalidades le todos os detalhes mesmo em check e preserva inclusao", async () => {
  for (const mode of ["venda", "locacao"]) {
    const browser = fixture({ mode });
    const counts = [];
    const result = await coletarNogueira(browser, project, mode, {
      enriquecer: false, anteriores: new Map([[item().linkReal, { dataInclusao: "2020-01-01" }]]),
      onCount: async total => counts.push(total),
    });
    assert.equal(result.totalEsperado, 1);
    assert.equal(result.imoveis[0].dataInclusao, "2020-01-01");
    assert.equal(result.imoveis[0].preco, mode === "venda" ? 360000.75 : null);
    assert.deepEqual(counts, [1]);
    assert.equal(browser.closed, 1);
  }
});

test("falhas de detalhe e mudancas da listagem fecham pagina e rejeitam coleta parcial", async () => {
  for (const option of [{ failure: true }, { change: true }]) {
    const browser = fixture(option);
    await assert.rejects(coletarNogueira(browser, project, "venda"), /HTTP 500|Listagem mudou/);
    assert.equal(browser.closed, 1);
  }
});

test("GET na sessao valida status, redirecionamento, prazo e cabecalhos", async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const url = `${origin}/imoveis/casa/`;
  globalThis.fetch = async (target, options) => {
    assert.equal(target, url);
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.cache, "no-store");
    return { ok: true, url, text: async () => "html", headers: new Headers({ "x-wp-total": "90", "x-wp-totalpages": "1" }) };
  };
  assert.deepEqual(await fetchNogueira(url), { body: "html", total: "90", pages: "1" });
  for (const changes of [{ ok: false, status: 500 }, { url: origin }]) {
    globalThis.fetch = async () => ({ ok: true, url, ...changes });
    await assert.rejects(fetchNogueira(url), /HTTP .*redirecionamento/);
  }
});
