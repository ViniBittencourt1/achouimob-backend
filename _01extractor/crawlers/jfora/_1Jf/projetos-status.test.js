import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { EventEmitter } from "node:events";
import test from "node:test";
import { JSDOM } from "jsdom";

const source = fs.readFileSync(new URL("./jfora.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("./painel.html", import.meta.url), "utf8");

function fila() {
  let resultados = [];
  const estados = [];
  const context = vm.createContext({
    running: false, stopRequested: false, currentQueue: [], currentIndex: -1,
    currentProcess: null, projectErrors: {}, backendRoot: "teste", process: { env: {} },
    loadPackageJson: () => ({ scripts: { teste: "node teste", outro: "node outro" } }),
    extractJforaScripts: () => [{ name: "teste" }, { name: "outro" }],
    ordenarScripts: names => names,
    expandirEtapas: names => names.flatMap(projeto => [
      { projeto, script: projeto, tipo: "venda" },
      { projeto, script: `${projeto}:locacao`, tipo: "aluguel" },
    ]),
    emitLog: () => {},
    emitState: () => estados.push(JSON.parse(JSON.stringify(context.projectErrors))),
    io: { emit: () => {} },
    spawn: () => {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      const result = resultados.shift();
      queueMicrotask(() => {
        if (result === "cancelado") context.stopRequested = true;
        if (result === "spawn-error") child.emit("error", new Error("Falha de inicializacao"));
        else child.emit("close", result === "cancelado" ? 1 : result);
      });
      return child;
    },
  });
  for (const field of ["City", "Bairro", "TipoImovel", "Localizacao", "LinkFoto", "Preco"]) {
    context[`apply${field}JsonCorrectionsToCrawlerFiles`] = () => ({ recordsUpdated: 0 });
  }
  vm.runInContext(source.slice(source.indexOf("async function runQueue("), source.indexOf('app.get("/api/projects"')), context);
  return { context, estados, run: async (results, names = ["teste"]) => {
    resultados = [...results];
    await context.runQueue(names);
  } };
}

test("erro em vendas permanece apos aluguel com sucesso e nao atinge outro projeto", async () => {
  const fixture = fila();
  await fixture.run([1, 0, 0, 0], ["teste", "outro"]);
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.context.projectErrors)), { teste: ["teste"] });
  assert.ok(fixture.estados.some(state => state.teste?.includes("teste")));
  await fixture.run([0, 0], ["outro"]);
  assert.ok(fixture.context.projectErrors.teste);
  await fixture.run([0, 0]);
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.context.projectErrors)), {});
});

test("falha em aluguel ou na inicializacao marca o projeto, cancelamento nao", async () => {
  const fixture = fila();
  await fixture.run([0, 1]);
  assert.deepEqual(Array.from(fixture.context.projectErrors.teste), ["teste:locacao"]);
  await fixture.run(["spawn-error", 0]);
  assert.deepEqual(Array.from(fixture.context.projectErrors.teste), ["teste"]);
  await fixture.run(["cancelado"]);
  assert.equal(fixture.context.projectErrors.teste, undefined);
});

test("API e eventos incluem erros para novas conexoes e atualizacoes", () => {
  let handler;
  let payload;
  const projectErrors = { teste: ["teste:locacao"] };
  const context = vm.createContext({
    projectErrors, running: false, currentQueue: [], currentIndex: -1,
    io: { emit: (_event, data) => { payload = data; } },
    app: { get: (_route, callback) => { handler = callback; } },
    extractJforaScripts: () => [], loadConfig: () => ({}),
  });
  vm.runInContext(source.slice(source.indexOf("function emitState()"), source.indexOf("function emitLog(")), context);
  context.emitState();
  assert.equal(payload.projectErrors, projectErrors);
  const start = source.indexOf('app.get("/api/projects"');
  vm.runInContext(source.slice(start, source.indexOf('app.post("/api/config"', start)), context);
  handler({}, { json: data => { payload = data; } });
  assert.equal(payload.projectErrors, projectErrors);
});

test("lista mostra nome sem anotacao e erro ao lado sem alterar selecao", () => {
  const dom = new JSDOM('<div id="projectsList"></div>');
  const list = dom.window.document.getElementById("projectsList");
  const context = vm.createContext({
    document: dom.window.document, projectsList: list,
    projects: [{ name: "teste", colecao: "jfTeste", venda: "teste", aluguel: "teste:locacao" }],
    currentConfig: { selectedScripts: ["teste"] }, projectErrors: { teste: ["teste:locacao"] },
  });
  vm.runInContext(html.slice(html.indexOf("    function renderProjects()"), html.indexOf("    async function loadData()")), context);
  context.renderProjects();
  assert.equal(list.textContent, "jfTesteERRO");
  assert.match(list.querySelector(".project-error").title, /teste:locacao/);
  assert.equal(list.querySelector("input").checked, true);
  list.querySelector("input").checked = false;
  context.updateProjectErrors({});
  assert.equal(list.textContent, "jfTeste");
  assert.equal(list.querySelector("input").checked, false);
  assert.match(html, /updateProjectErrors\(state\.projectErrors\)/);
  dom.window.close();
});

test("lista ordena pelo nome exibido sem alterar projetos, selecoes ou erros", () => {
  const dom = new JSDOM('<div id="projectsList"></div>');
  const list = dom.window.document.getElementById("projectsList");
  const projects = [
    { name: "primeiro", colecao: "nitZulu" },
    { name: "segundo", colecao: "jfÁguia" },
    { name: "jfBeta" },
    { name: "quarto", colecao: "jf10Imoveis" },
    { name: "quinto", colecao: "jf2Imoveis" },
    { name: "niteroi" },
    { name: "niteroi:vendas:validar" },
    { name: "jeferson" },
    { name: "nitMarchipp", colecao: "nitMarchipp" },
  ];
  const context = vm.createContext({
    document: dom.window.document, projectsList: list, projects,
    currentConfig: { selectedScripts: ["primeiro"] },
    projectErrors: { segundo: ["segundo:locacao"] },
  });
  vm.runInContext(html.slice(html.indexOf("    function renderProjects()"), html.indexOf("    async function loadData()")), context);
  context.renderProjects();
  assert.deepEqual(
    Array.from(list.querySelectorAll("input"), input => input.value),
    ["quinto", "quarto", "segundo", "jfBeta", "nitMarchipp", "primeiro"],
  );
  assert.equal(projects[0].name, "primeiro");
  assert.equal(list.querySelector('input[value="primeiro"]').checked, true);
  assert.equal(list.querySelector('[data-project="segundo"] .project-error').textContent, "ERRO");
  dom.window.close();
});
