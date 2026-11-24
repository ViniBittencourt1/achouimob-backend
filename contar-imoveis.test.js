import assert from "node:assert/strict";
import test from "node:test";
import { contarImoveis, contarProjeto, listarContagens } from "./contar-imoveis.js";
import { listarProjetosAlugueis } from "./_01extractor/crawlers/jfora/_1Jf/alugueis-model.js";
import fs from "node:fs";
import { registrarTotalLocacao } from "./_01extractor/crawlers/jfora/_utils/locacaoContagem.js";
import { RIO_SPREADSHEET_ID } from "./_01extractor/crawlers/jfora/rio/projects.js";
import { buildUrlMidas } from "./_01extractor/crawlers/jfora/rio/midas.js";

test("contagem geral cobre todas as vendas e todos os 85 projetos de aluguel sem duplicar pares", () => {
  const projects = listarContagens();
  const pkg = JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url), "utf8"));
  assert.equal(new Set(projects.map(project => `${project.collection}|${project.tipo}`)).size, projects.length);
  assert.deepEqual(
    projects.filter(project => project.tipo === "aluguel").map(project => project.collection).sort(),
    listarProjetosAlugueis(pkg.scripts).map(project => project.collection).sort(),
  );
  assert.equal(projects.filter(project => project.tipo === "venda" && project.collection.startsWith("jf")).length, 57);
});

test("GM tem venda C49 e locacao desativada no painel e na contagem", async () => {
  const pkg = JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url), "utf8"));
  const gm = listarContagens().filter(project => project.collection === "jfGm");
  assert.equal(gm.find(project => project.tipo === "venda").kind, "c49");
  const rental = gm.find(project => project.tipo === "aluguel");
  assert.equal(rental.kind, "sem-rota");
  assert.equal(await contarProjeto(null, rental), 0);
  const panel = listarProjetosAlugueis(pkg.scripts).find(project => project.name === "gm:locacao");
  assert.equal(panel.collection, "jfGm");
  assert.ok(pkg.scripts["gm:locacao"].includes("locacaoPreparacao.js gm"));
});

test("executavel chama somente contadores e registra tipos separados, sempre headless", async () => {
  const calls = [];
  const results = await contarImoveis(["jfHolder"], {
    abrirBrowser: async options => {
      assert.equal(options.headlessOverride, true);
      return { close: async () => calls.push("fechar") };
    },
    contarProjeto: async (_browser, project) => project.tipo === "venda" ? 18 : 2,
    registrarTotaisImoveis: async (entries, _id, tipo) => {
      for (const entry of entries) calls.push([tipo === "Vendas" ? "venda" : "aluguel", entry.projeto, entry.total]);
    },
  });
  assert.equal(results.length, 2);
  assert.ok(results.every(result => result.status === "ok" && result.salvo === true));
  assert.ok(calls.some(call => Array.isArray(call) && call.join() === "venda,jfHolder,18"));
  assert.ok(calls.some(call => Array.isArray(call) && call.join() === "aluguel,jfHolder,2"));
  assert.equal(calls.filter(call => call === "fechar").length, 2);
  assert.equal(typeof registrarTotalLocacao, "function");
});

test("falha no Sheets preserva totais consultados e nao declara lote salvo", async () => {
  const previous = process.exitCode;
  try {
    const results = await contarImoveis(["jfHolder"], {
      abrirBrowser: async () => ({ close: async () => {} }),
      contarProjeto: async () => 12,
      registrarTotaisImoveis: async (_entries, _id, tipo) => {
        if (tipo === "Vendas") throw new Error("Quota Sheets");
      },
    });
    const venda = results.find(item => item.tipo === "venda");
    assert.equal(venda.total, 12);
    assert.equal(venda.salvo, false);
    assert.equal(venda.erroSalvamento, "Quota Sheets");
    assert.equal(results.find(item => item.tipo === "aluguel").salvo, true);
    assert.equal(process.exitCode, 1);
  } finally { process.exitCode = previous; }
});

test("Rio conta apenas rotas habilitadas e grava as modalidades na planilha propria", async () => {
  const projects = listarContagens().filter(project => project.collection.startsWith("rio"));
  assert.equal(projects.length, 57);
  assert.equal(projects.some(project => project.collection === "rioLopes" && project.tipo === "venda"), true);
  assert.equal(projects.some(project => project.collection === "rioLopes" && project.tipo === "aluguel"), true);
  assert.equal(projects.some(project => project.collection === "rioRemax" && project.tipo === "venda"), true);
  assert.equal(projects.some(project => project.collection === "rioRemax" && project.tipo === "aluguel"), true);
  assert.equal(projects.some(project => project.collection === "rioJulio" && project.tipo === "venda"), true);
  assert.equal(projects.some(project => project.collection === "rioJulio" && project.tipo === "aluguel"), true);
  assert.equal(projects.some(project => project.collection === "rioPrivilegio" && project.tipo === "venda"), true);
  assert.equal(projects.some(project => project.collection === "rioPrivilegio" && project.tipo === "aluguel"), false);
  assert.equal(projects.some(project => project.collection === "rioNovaEpoca" && project.tipo === "venda"), true);
  assert.equal(projects.some(project => project.collection === "rioNovaEpoca" && project.tipo === "aluguel"), false);
  assert.equal(projects.some(project => project.collection === "rioMaisVeloz" && project.tipo === "venda"), true);
  assert.equal(projects.some(project => project.collection === "rioMaisVeloz" && project.tipo === "aluguel"), false);
  assert.equal(projects.some(project => project.collection === "rioDna" && project.tipo === "venda"), true);
  assert.equal(projects.some(project => project.collection === "rioDna" && project.tipo === "aluguel"), false);
  assert.equal(projects.some(project => project.collection === "rioImobras" && project.tipo === "venda"), true);
  assert.equal(projects.some(project => project.collection === "rioAvegui" && project.tipo === "venda"), true);
  assert.equal(projects.some(project => project.collection === "rioAtlantica" && project.tipo === "venda"), true);
  assert.equal(projects.some(project => project.collection === "rioAtlantica" && project.tipo === "aluguel"), true);
  assert.equal(projects.some(project => project.collection === "rioInvista"), false);
  assert.equal(projects.some(project => project.collection === "rioMansou" && project.tipo === "aluguel"), false);
  assert.equal(projects.some(project => project.collection === "rioEdgard" && project.tipo === "aluguel"), true);
  assert.equal(projects.some(project => project.collection === "rioOkre" && project.tipo === "venda"), true);
  assert.equal(projects.some(project => project.collection === "rioApsa" && project.tipo === "aluguel"), true);
  const calls = [];
  const results = await contarImoveis(["rioCasalta"], {
    abrirBrowser: async () => ({ close: async () => {} }),
    contarProjeto: async (_browser, project) => project.tipo === "venda" ? 47 : 19,
    registrarTotaisImoveis: async (entries, id, tipo) => calls.push({ entries, id, tipo }),
  });

  assert.equal(results.length, 2);
  assert.ok(results.every(result => result.salvo));
  assert.ok(calls.every(call => call.id === RIO_SPREADSHEET_ID));
  assert.deepEqual(calls.map(call => call.tipo), ["Vendas", "Locacao"]);
});

test("contagem Rio Midas usa o coletor apropriado e valida a imobiliaria", async () => {
  const project = listarContagens().find(item => item.collection === "rioMti" && item.tipo === "venda");
  let closed = false;
  const browser = { newPage: async () => ({
    goto: async () => ({ status: () => 200 }),
    waitForFunction: async () => {},
    url: () => buildUrlMidas(project, "venda", 1),
    evaluate: async () => ({
      heading: "1 Imóvel à Venda", label: "Encontramos 1 resultado para sua busca",
      total: 1, de: 1, ate: 1, currentPage: 1,
      items: [{ imobiliaria: "1778", tipo_negocio_descricao: "Venda" }],
    }),
    close: async () => { closed = true; },
  }) };
  assert.equal(await contarProjeto(browser, project), 1);
  assert.equal(closed, true);
});

test("contagem Nova Epoca usa a API de vendas", async t => {
  const project = listarContagens().find(item => item.collection === "rioNovaEpoca" && item.tipo === "venda");
  t.mock.method(globalThis, "fetch", async url => {
    const busca = new URL(url);
    assert.equal(busca.origin, "https://www.novaepoca.com.br");
    assert.equal(busca.pathname, "/api/anuncios/search");
    assert.equal(busca.searchParams.get("finalidade"), "venda");
    return { ok: true, json: async () => ({ total: 0, page: 1, pagesize: 100, items: [] }) };
  });
  assert.equal(await contarProjeto(null, project), 0);
});

test("contagem Privilegio usa a API de vendas", async t => {
  const project = listarContagens().find(item => item.collection === "rioPrivilegio" && item.tipo === "venda");
  t.mock.method(globalThis, "fetch", async url => {
    const busca = new URL(url);
    assert.equal(busca.origin, "https://privilegioimoveis.com.br");
    assert.equal(busca.pathname, "/api/imoveis");
    assert.equal(busca.searchParams.get("finalidade"), "2");
    return { ok: true, json: async () => ({ pagination: { total: 0, page: 1, per_page: 100 }, lista: [] }) };
  });
  assert.equal(await contarProjeto(null, project), 0);
});

test("contagem Rio Apsa usa API de aluguel", async t => {
  const project = listarContagens().find(item => item.collection === "rioApsa" && item.tipo === "aluguel");
  const previous = process.env.APSA_API_URL;
  process.env.APSA_API_URL = "https://erp.iy2b.com/systemakers/sli/rest/msiteimobbuscaimv/post/pesquisar/pesqImoveis/asp-pkasa/teste/endpoint";
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    assert.equal(JSON.parse(options.body).lstAondeLocal, "5");
    return { ok: true, json: async () => ({ mensagens: [
      { id: "totRegs", mensagem: "2" }, { id: "listaGeoJsonVO", lista: [] },
    ] }) };
  });
  try { assert.equal(await contarProjeto(null, project), 2); }
  finally {
    if (previous === undefined) delete process.env.APSA_API_URL;
    else process.env.APSA_API_URL = previous;
  }
});

test("HTTP consulta apenas quantidade em pagina estatica quando navegador recebe 403", async t => {
  const project = listarContagens().find(item => item.collection === "jfAdMyHouse" && item.tipo === "venda");
  let closed = false;
  const browser = { newPage: async () => ({
    goto: async () => ({ status: () => 403 }), close: async () => { closed = true; },
  }) };
  t.mock.method(globalThis, "fetch", async () => ({
    ok: true, url: project.url, text: async () => '<div class="topsearch__total"><strong>123</strong> Imoveis encontrados</div>',
  }));
  assert.equal(await contarProjeto(browser, project), 123);
  assert.equal(closed, true);
});

test("erro de contador preserva quantidade anterior e nao impede a outra modalidade", async () => {
  const calls = [];
  const previous = process.exitCode;
  try {
    const results = await contarImoveis(["jfHolder"], {
      abrirBrowser: async () => ({ close: async () => {} }),
      contarProjeto: async (_browser, project) => {
        if (project.tipo === "venda") throw new Error("Site indisponivel");
        return 2;
      },
      registrarTotaisImoveis: async (_entries, _id, tipo) => calls.push(tipo === "Vendas" ? "venda" : "aluguel"),
    });
    assert.deepEqual(calls, ["aluguel"]);
    assert.equal(results.find(result => result.tipo === "venda").status, "erro");
    assert.equal(process.exitCode, 1);
  } finally { process.exitCode = previous; }
});
