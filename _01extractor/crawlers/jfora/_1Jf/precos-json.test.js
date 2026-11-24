import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import { listarPendenciasPrecoJson, upsertConfirmacoesPrecoJson } from "./precos-json.js";

test("lista preços pendentes por limite e respeita confirmações pelo link ou índice", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "precos-json-"));
  const crawlerDir = path.join(root, "crawler");
  fs.mkdirSync(crawlerDir);
  fs.writeFileSync(path.join(crawlerDir, "rioTeste.json"), JSON.stringify([
    { linkReal: "https://example.com/normal", preco: 10000000 },
    { linkReal: "https://example.com/high", preco: 10000001, titulo: "Preço alto" },
    { linkReal: "https://example.com/zero", preco: 0 },
    { preco: 0, titulo: "Sem link" },
  ]));
  fs.writeFileSync(path.join(crawlerDir, "rioTesteRetiradosVendas.json"), JSON.stringify([
    { linkReal: "https://example.com/removed", preco: 0 },
  ]));

  try {
    const confirmations = [
      { file: "rioTeste.json", linkReal: "https://example.com/high", preco: 10000001 },
      { file: "rioTeste.json", index: 3, preco: 0 },
    ];
    const issues = listarPendenciasPrecoJson(root, confirmations);
    assert.deepEqual(issues.map(issue => [issue.linkReal, issue.motivo]), [["https://example.com/zero", "zero"]]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("atualiza confirmações existentes e mantém confirmações sem link identificadas pelo índice", () => {
  const existing = [{ file: "rioTeste.json", linkReal: "https://example.com/1", preco: 20000000, confirmadoEm: "anterior" }];
  const updated = upsertConfirmacoesPrecoJson(existing, [
    { file: "rioTeste.json", linkReal: "https://example.com/1", preco: 20000000 },
    { file: "rioTeste.json", linkReal: "", index: 4, preco: 0 },
  ], "agora");

  assert.equal(updated.length, 2);
  assert.equal(updated[0].confirmadoEm, "agora");
  assert.deepEqual(updated[1], {
    file: "rioTeste.json",
    linkReal: "",
    preco: 0,
    confirmadoEm: "agora",
    index: 4,
  });
  assert.throws(() => upsertConfirmacoesPrecoJson([], [{ file: "rioTeste.json", linkReal: "", preco: 0 }]), /Pendência de preço inválida/);
});

test("API confirma em lote somente os preços ainda pendentes e exige confirmação explícita", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "precos-json-api-"));
  const crawlerDir = path.join(root, "crawler");
  const confirmationsPath = path.join(root, "_03database", "outros", "preco-json-confirmations.json");
  fs.mkdirSync(crawlerDir);
  fs.mkdirSync(path.dirname(confirmationsPath), { recursive: true });
  fs.writeFileSync(path.join(crawlerDir, "rioTeste.json"), JSON.stringify([
    { linkReal: "https://example.com/already", preco: 20000000 },
    { linkReal: "https://example.com/high", preco: 15000000 },
    { linkReal: "https://example.com/zero", preco: 0 },
  ]));
  fs.writeFileSync(confirmationsPath, JSON.stringify([
    { file: "rioTeste.json", linkReal: "https://example.com/already", preco: 20000000, confirmadoEm: "anterior" },
  ]));

  try {
    const source = fs.readFileSync(new URL("./jfora.js", import.meta.url), "utf8");
    const start = source.indexOf('app.post("/api/preco-json-issues/confirm-all"');
    const end = source.indexOf("\n});", start) + 4;
    assert.ok(start >= 0 && end > start);
    let handler;
    vm.runInNewContext(source.slice(start, end), {
      app: { post: (_route, callback) => { handler = callback; } },
      backendRoot: root,
      running: false,
      fs,
      path,
      listarPendenciasPrecoJson,
      upsertConfirmacoesPrecoJson,
      nowStamp: () => "agora",
      loadPrecoJsonConfirmations: () => JSON.parse(fs.readFileSync(confirmationsPath, "utf8")),
      savePrecoJsonConfirmations: confirmations => fs.writeFileSync(confirmationsPath, JSON.stringify(confirmations)),
      emitLog: () => {},
    });

    const invoke = body => {
      const result = { statusCode: 200, body: null };
      handler({ body }, {
        status(statusCode) { result.statusCode = statusCode; return this; },
        json(value) { result.body = value; return this; },
      });
      return result;
    };
    assert.equal(invoke({}).statusCode, 400);
    const response = invoke({ confirmacao: true });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(JSON.stringify(response.body)), { ok: true, confirmed: 2, total: 2 });
    const saved = JSON.parse(fs.readFileSync(confirmationsPath, "utf8"));
    assert.equal(saved.length, 3);
    assert.ok(saved.filter(item => item.confirmadoEm === "agora").every(item => item.file === "rioTeste.json"));
    assert.equal(listarPendenciasPrecoJson(root, saved).length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
