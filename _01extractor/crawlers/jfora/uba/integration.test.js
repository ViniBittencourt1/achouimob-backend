import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { projetosUba } from "./projects.js";
import { montarProjetosCombinados, expandirEtapas } from "../_utils/projetosCombinados.js";
import { listarProjetosAlugueis } from "../_1Jf/alugueis-model.js";
import { incluirAlugueisConfigurados, cidadeProjeto } from "../../../../crawler-order.cjs";
import { descobrirScriptsExecucao, descobrirPendencias } from "../../../../crawler-runner-vendas.cjs";
import { runBatch } from "../../../../render-daily.js";
import { reportHtml } from "../../../../crawler-report.cjs";

const backend = fileURLToPath(new URL("../../../../", import.meta.url));
const scripts = JSON.parse(fs.readFileSync(path.join(backend, "package.json"), "utf8")).scripts;
const expected = projetosUba.flatMap(p => [p.collection.toLowerCase(), `${p.collection.toLowerCase()}:locacao`]);
const all = montarProjetosCombinados(scripts);
const uba = all.filter(p => p.colecao.startsWith("uba"));

test("painel e executavel incluem exatamente nove pares Uba sem aliases duplicados", () => {
  assert.equal(uba.length, 9);
  assert.deepEqual(expandirEtapas(uba.map(p => p.name), all).map(p => p.script), expected);
  assert.deepEqual(descobrirScriptsExecucao(backend).filter(name => name.startsWith("uba")), expected);
  assert.equal(descobrirPendencias(backend, descobrirScriptsExecucao(backend)).filter(p => p.script.startsWith("uba")).length, 0);
  assert.deepEqual(listarProjetosAlugueis(scripts).filter(p => p.collection.startsWith("uba")).map(p => p.name),
    expected.filter(name => name.endsWith(":locacao")));
  assert.equal(all.some(p => p.name.startsWith("uba:")), false);
  assert.ok(expected.every(name => cidadeProjeto(name) === "Ubá"));
});

test("selecao salva inclui nove vendas e expansao diaria inclui seus alugueis", () => {
  const config = JSON.parse(fs.readFileSync(path.join(backend, "_01extractor", "crawlers", "jfora", "_1Jf", "site-scheduler-config.json"), "utf8"));
  const selected = config.selectedScripts.filter(name => name.startsWith("uba"));
  assert.deepEqual(incluirAlugueisConfigurados(selected, Object.keys(scripts)), expected);
  for (const project of projetosUba) {
    const alias = project.collection.slice(3).toLowerCase();
    assert.equal(scripts[`uba:${alias}:vendas`], scripts[project.collection.toLowerCase()]);
    assert.equal(scripts[`uba:${alias}:alugueis`], scripts[`${project.collection.toLowerCase()}:locacao`]);
  }
});

test("painel renderiza todos os projetos Uba e resolve colecao sem ler fonte do crawler", () => {
  const source = fs.readFileSync(new URL("../_1Jf/jfora.js", import.meta.url), "utf8");
  const context = vm.createContext({ extractJforaScripts: () => all });
  const start = source.indexOf("function getCollectionNameForScript(");
  vm.runInContext(source.slice(start, source.indexOf("function loadConfig(", start)), context);
  for (const project of uba) assert.equal(context.getCollectionNameForScript(project.name), project.colecao);
  const dom = new JSDOM('<div id="projectsList"></div>');
  try {
    const html = fs.readFileSync(new URL("../_1Jf/painel.html", import.meta.url), "utf8");
    const list = dom.window.document.getElementById("projectsList");
    const ui = vm.createContext({
      document: dom.window.document, projectsList: list, projects: uba,
      currentConfig: { selectedScripts: uba.map(p => p.name) }, projectErrors: {},
    });
    vm.runInContext(html.slice(html.indexOf("    function renderProjects()"), html.indexOf("    async function loadData()")), ui);
    ui.renderProjects();
    assert.equal(list.querySelectorAll("input:checked").length, 9);
    for (const p of uba) assert.ok(list.textContent.includes(p.colecao));
  } finally { dom.window.close(); }
});

test("relatorio diario e HTML usado no email incluem todas as dezoito etapas com cidade correta", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "uba-report-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const called = [];
  const result = await runBatch({
    scripts: expected, prepare() {},
    run: async name => {
      called.push(name);
      return name === "ubagb" ? { status: "failed", error: "Falha simulada" } : { status: "completed", code: 0 };
    },
    reportPath: path.join(root, "report.json"), progressFile: path.join(root, "progress.json"),
  });
  assert.deepEqual(called, expected);
  assert.equal(result.success, false);
  assert.equal(result.report.projects.length, 18);
  assert.ok(result.report.projects.every(p => p.city === "Ubá"));
  assert.equal(result.report.projects.filter(p => p.kind === "Venda").length, 9);
  assert.equal(result.report.projects.filter(p => p.kind === "Aluguel").length, 9);
  const html = reportHtml(result.report);
  for (const name of expected) assert.ok(html.includes(name));
  assert.match(html, /Falha simulada/);
  const runner = fs.readFileSync(path.join(backend, "crawler-runner.cjs"), "utf8");
  const start = runner.indexOf("function generateEmailHTML(");
  const email = vm.createContext({ fs, reportFile: result.reportPath, reportHtml });
  vm.runInContext(`${runner.slice(start, runner.indexOf("  const { success", start))}\n}`, email);
  assert.equal(email.generateEmailHTML({}), html);
  assert.deepEqual(JSON.parse(fs.readFileSync(result.reportPath, "utf8")).projects, result.report.projects);
});
