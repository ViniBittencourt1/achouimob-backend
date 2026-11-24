import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { projetosRioHabilitados } from "./projects.js";
import { montarProjetosCombinados, expandirEtapas } from "../_utils/projetosCombinados.js";
import { listarProjetosAlugueis } from "../_1Jf/alugueis-model.js";
import { cidadeProjeto, incluirAlugueisConfigurados, indiceProjeto } from "../../../../crawler-order.cjs";
import { descobrirScriptsExecucao, descobrirPendencias } from "../../../../crawler-runner-vendas.cjs";
import { reportHtml } from "../../../../crawler-report.cjs";

const backend = fileURLToPath(new URL("../../../../", import.meta.url));
const scripts = JSON.parse(fs.readFileSync(new URL("../../../../package.json", import.meta.url), "utf8")).scripts;
const expected = [
  "rioapsa:locacao",
  "rioatento", "rioatento:locacao",
  "rioatlantica", "rioatlantica:locacao",
  "rioatma", "rioatma:locacao",
  "rioavegui", "rioavegui:locacao", "riochaves", "riochaves:locacao", "riodna", "rioedgard", "rioedgard:locacao", "rioimobras", "rioimobras:locacao",
  "rioimoveisdorio", "riojulio", "riojulio:locacao", "riolardecarioca", "riolardecarioca:locacao", "riolopes", "riolopes:locacao", "riomaisveloz", "riomelhores",
  "riomr", "riomr:locacao", "riomti", "riomti:locacao", "rionovaepoca", "riookre", "riookre:locacao", "rioolympica", "rioolympica:locacao", "rioprivilegio", "rioremax", "rioremax:locacao",
  "riocasalta", "riocasalta:locacao",
  "riofrassetti", "riofrassetti:locacao", "riogriffe", "riogriffe:locacao",
  "riobaez", "riobaez:locacao",
  "riojc", "riojc:locacao", "riolopa", "riolopa:locacao", "riomansou", "riorjc",
  "riordiniz", "riordiniz:locacao", "rioreisprincipe", "rioreisprincipe:locacao", "riorbs", "riorbs:locacao", "riosampaio", "riosampaio:locacao", "riosergiocastro", "riosergiocastro:locacao", "riosimoes", "riosimoes:locacao", "riovivax", "riovivax:locacao", "riowalker", "riowalker:locacao", "riozelo", "riozelo:locacao",
  "rioluciene", "rioluciene:locacao", "riofr", "riofr:locacao", "rioforte", "rioforte:locacao", "riohomehub", "riohomehub:locacao",
  "rioinvexo", "rioinvexo:locacao", "riojailson", "riojailson:locacao", "riomg", "riomg:locacao", "riorjardim", "riorjardim:locacao",
  "riocabral", "riocabral:locacao", "rionovi", "rionovi:locacao", "rioramiro", "rioramiro:locacao", "riorenascenca", "riorenascenca:locacao",
];

test("Rio inclui cinquenta e um projetos habilitados e suas rotas exatas", () => {
  assert.equal(projetosRioHabilitados.length, 51);
  assert.deepEqual(descobrirScriptsExecucao(backend).filter(name => name.startsWith("rio")), expected);
  assert.deepEqual(
    listarProjetosAlugueis(scripts).filter(project => project.collection.startsWith("rio")).map(project => project.name),
    expected.filter(name => name.endsWith(":locacao")),
  );
  const rio = montarProjetosCombinados(scripts).filter(project => project.colecao.startsWith("rio"));
  assert.equal(rio.length, 51);
  assert.deepEqual(expandirEtapas(rio.map(project => project.name), rio).map(step => step.script), expected);
  assert.deepEqual(incluirAlugueisConfigurados(rio.map(project => project.name), Object.keys(scripts)), expected);
  for (const project of projetosRioHabilitados) {
    const name = project.collection.toLowerCase();
    if (project.negociacoes?.includes("venda") ?? Boolean(project.urlVendas)) {
      assert.equal(scripts[name], `node _01extractor/crawlers/jfora/rio/${project.collection}/index.js`);
    }
    if (project.negociacoes?.includes("locacao") ?? Boolean(project.urlLocacao)) {
      assert.equal(scripts[`${name}:locacao`], `node _01extractor/crawlers/jfora/rio/${project.collection}/locacao.js`);
    }
  }
  assert.equal(scripts.rioinvista, undefined);
  assert.equal(scripts.riometropole, undefined);
  assert.equal(scripts["riometropole:locacao"], undefined);
  assert.equal(scripts.riocj, undefined);
  assert.equal(scripts["riomansou:locacao"], undefined);
  assert.equal(scripts["riodna:locacao"], undefined);
  assert.equal(scripts["riomaisveloz:locacao"], undefined);
  assert.equal(scripts["rionovaepoca:locacao"], undefined);
  assert.equal(scripts["rioprivilegio:locacao"], undefined);
  assert.equal(scripts["riorjc:locacao"], undefined);
  assert.equal(cidadeProjeto("riorjc"), "Rio de Janeiro");
  const config = JSON.parse(fs.readFileSync(new URL("../_1Jf/site-scheduler-config.json", import.meta.url), "utf8"));
  const configuredRio = config.selectedScripts.filter(name => name.startsWith("rio"));
  for (const name of ["riordiniz", "rioreisprincipe", "riorbs", "riosampaio", "riosergiocastro", "riosimoes", "riovivax", "riowalker", "riozelo", "riocabral", "rionovi", "rioramiro", "riorenascenca"]) {
    assert.ok(configuredRio.includes(name), `${name} deve entrar na selecao diaria`);
  }
  const configuredRioNames = new Set(configuredRio.map(name => name.replace(/:locacao$/, "")));
  assert.deepEqual(
    incluirAlugueisConfigurados(configuredRio, Object.keys(scripts)),
    expected.filter(name => configuredRioNames.has(name.replace(/:locacao$/, ""))),
  );
});

test("classificacao inclui Rio depois de Uba sem inventar alugueis pendentes", () => {
  assert.ok(indiceProjeto("riocasalta") > indiceProjeto("ubaAloisio"));
  assert.ok(expected.every(name => cidadeProjeto(name) === "Rio de Janeiro"));
  const pending = descobrirPendencias(backend, descobrirScriptsExecucao(backend)).filter(project => project.script.startsWith("rio"));
  assert.deepEqual(pending.map(project => project.script), ["riomansou:locacao"]);
  assert.ok(pending.every(project => project.city === "Rio de Janeiro"));
});

test("relatorio HTML do email inclui Rio mas omite linhas sem crawler ou rota", () => {
  const projects = expected.map(script => ({
    script, city: cidadeProjeto(script), kind: script.endsWith(":locacao") ? "Aluguel" : "Venda",
    status: "completed", code: 0,
  }));
  const html = reportHtml({
    projects: [...projects,
      { script: "riomansou:locacao", city: "Rio de Janeiro", kind: "Aluguel", status: "unavailable" },
    ],
    summary: { completed: 18, unavailable: 1, failed: 0, pending: 0 },
  });
  assert.match(html, /Rio de Janeiro/);
  for (const name of expected) assert.ok(html.includes(name));
  assert.ok(html.includes("rioatento:locacao"));
  assert.ok(!html.includes("riomansou:locacao"));
});
