import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { arquivoPrincipalImoveis } from "../_utils/vendasSincronizacao.js";

const source = fs.readFileSync(new URL("./jfora.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("./painel.html", import.meta.url), "utf8");

test("confirmacao individual persiste so o registro escolhido e rejeita estado desatualizado", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "foto-painel-"));
  try {
    const crawler = path.join(root, "crawler");
    fs.mkdirSync(crawler);
    const records = [
      { linkReal: "https://example.com/1", linkFoto: "" },
      { linkReal: "https://example.com/2", linkFoto: "" },
      { linkReal: "https://example.com/3", linkFoto: "https://example.com/foto.jpg" },
      { linkFoto: "" },
    ];
    const file = "jfOliver.json";
    const jsonPath = path.join(crawler, file);
    fs.writeFileSync(jsonPath, JSON.stringify(records));
    const confirmationPath = path.join(root, "confirmacoes.json");
    let handler;
    const context = vm.createContext({
      fs, path, backendRoot: root, outrosDatabaseDir: root,
      linkFotoJsonConfirmationsPath: confirmationPath,
      arquivoPrincipalImoveis, emitLog: () => {}, nowStamp: () => "agora",
      app: { post: (_route, callback) => { handler = callback; } },
    });
    vm.runInContext(source.slice(source.indexOf("function loadLinkFotoJsonConfirmations("), source.indexOf("function upsertLinkFotoJsonCorrection(")), context);
    const start = source.indexOf('app.post("/api/linkfoto-json-issues/confirm",');
    vm.runInContext(source.slice(start, source.indexOf('\n});', start) + 4), context);
    function request(body) {
      let status = 200;
      let data;
      const res = { status: code => { status = code; return res; }, json: result => { data = result; } };
      handler({ body }, res);
      return { status, data };
    }
    const body = { file, linkReal: records[1].linkReal, index: 1, confirmacao: true };
    assert.equal(request({ ...body, confirmacao: false }).status, 400);
    assert.equal(request({ ...body, file: "../jfOliver.json" }).status, 400);
    assert.equal(request({ ...body, file: "jfOliverRetiradosVendas.json" }).status, 400);
    assert.equal(request({ ...body, linkReal: "ausente" }).status, 404);
    assert.equal(request({ ...body, linkReal: records[2].linkReal }).status, 409);
    assert.equal(request(body).data.confirmed, 1);
    assert.equal(request(body).data.confirmed, 0);
    const saved = JSON.parse(fs.readFileSync(confirmationPath, "utf8"));
    assert.equal(saved.length, 1);
    assert.equal(saved[0].linkReal, records[1].linkReal);
    assert.deepEqual(JSON.parse(fs.readFileSync(jsonPath, "utf8")), records);
    fs.writeFileSync(path.join(crawler, "jfOliverLocacao.json"), JSON.stringify(records));
    assert.equal(request({ ...body, file: "jfOliverLocacao.json" }).data.confirmed, 1);
    assert.equal(request({ file, index: 3, confirmacao: true }).data.confirmed, 1);
    assert.equal(request({ file, index: -1, confirmacao: true }).status, 400);
    records[1].linkFoto = "https://example.com/nova.jpg";
    fs.writeFileSync(jsonPath, JSON.stringify(records));
    assert.equal(request(body).status, 409);
    context.app.get = (_route, callback) => { handler = callback; };
    const getStart = source.indexOf('app.get("/api/linkfoto-json-issues",');
    vm.runInContext(source.slice(getStart, source.indexOf('\n});', getStart) + 4), context);
    const pending = request({}).data.issues;
    assert.ok(!pending.some(item => item.file === file && item.index === 3));
    assert.ok(pending.some(item => item.file === file && item.index === 0));
    assert.ok(!pending.some(item => item.file === "jfOliverLocacao.json" && item.index === 1));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

async function panel(fetch) {
  const dom = new JSDOM(`<button id="btnCheckLinkFotoJson"></button><button id="btnConfirmAllLinkFotoJson"></button>
    <div id="linkFotoJsonSummary"></div><div id="linkFotoJsonIssues"></div><div id="linkFotoJsonCountBadge"></div>`);
  const issues = [0, 1].map(index => ({ file: "jfOliver.json", index, linkReal: `https://example.com/${index}` }));
  const context = vm.createContext({
    document: dom.window.document, fetch, issues,
    escapeHtml: value => String(value), negociacaoArquivo: () => "Venda", appendLog: () => {},
  });
  const start = html.indexOf('    const btnCheckLinkFotoJson =');
  vm.runInContext(html.slice(start, html.indexOf('    btnCheckLinkFotoJson.addEventListener', start)), context);
  vm.runInContext("renderLinkFotoJsonIssues(issues)", context);
  return { dom, issues, context };
}

test("cada card confirma individualmente, remove so a pendencia selecionada e mantem handlers", async () => {
  const calls = [];
  const { dom, issues } = await panel(async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ confirmed: 1 }) };
  });
  try {
    dom.window.document.querySelectorAll(".btn-confirm-linkfoto")[1].click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls[0].url, "/api/linkfoto-json-issues/confirm");
    assert.equal(calls[0].body.index, 1);
    assert.equal(calls[0].body.confirmacao, true);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].index, 0);
    assert.equal(dom.window.document.querySelectorAll(".issue-card").length, 1);
    dom.window.document.querySelector(".btn-confirm-linkfoto").click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(issues.length, 0);
    assert.equal(calls.length, 2);
  } finally { dom.window.close(); }
});

test("falha de confirmacao permanece visivel no card sem remover a pendencia", async () => {
  const { dom, issues } = await panel(async () => ({ ok: false, json: async () => ({ error: "Foto alterada" }) }));
  try {
    dom.window.document.querySelector(".btn-confirm-linkfoto").click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(issues.length, 2);
    assert.equal(dom.window.document.querySelector('[data-role="error"]').textContent, "Foto alterada");
    assert.equal(dom.window.document.querySelector(".btn-confirm-linkfoto").disabled, false);
  } finally { dom.window.close(); }
});
