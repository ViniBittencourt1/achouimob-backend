import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runJXavier } from "./runner.js";
import { exportToSheets, UBA_SPREADSHEET_ID } from "../sheets.js";

function setup(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jxavier-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const outputPath = path.join(directory, "ubaJXavier.json");
  const previous = [{ linkReal: "https://www.jxavier.com.br/detail?id=1", dataInclusao: "2020-01-01" }];
  fs.writeFileSync(outputPath, JSON.stringify(previous));
  const calls = [];
  return {
    outputPath, previous, calls,
    browserFactory: async options => {
      assert.equal(options.headlessOverride, true);
      return { close: async () => calls.push(["close"]) };
    },
    registrar: async (...args) => calls.push(["count", ...args]),
    syncVendas: async options => calls.push(["vendas", options]),
    syncLocacao: async options => calls.push(["locacao", options]),
  };
}

test("check nao grava contagem, JSON ou Sheets e fecha navegador", async t => {
  const options = setup(t);
  const original = fs.readFileSync(options.outputPath, "utf8");
  const result = await runJXavier("venda", {
    ...options, check: true,
    coletar: async (_browser, project, negociacao, context) => {
      assert.equal(project.collection, "ubaJXavier");
      assert.equal(negociacao, "venda");
      assert.equal(context.enriquecer, false);
      assert.deepEqual([...context.anteriores.values()], options.previous);
      await context.onCount(307);
      return { imoveis: options.previous, totalEsperado: 307 };
    },
  });
  assert.equal(result.totalEsperado, 307);
  assert.deepEqual(options.calls, [["close"]]);
  assert.equal(fs.readFileSync(options.outputPath, "utf8"), original);
});

test("ambas as finalidades usam planilha Uba e tab compartilhado via sincronizadores", async t => {
  for (const negociacao of ["venda", "locacao"]) {
    const options = setup(t);
    await runJXavier(negociacao, {
      ...options,
      coletar: async (_browser, _project, _negociacao, context) => {
        assert.equal(context.enriquecer, true);
        await context.onCount(1);
        return { imoveis: options.previous, totalEsperado: 1 };
      },
    });
    assert.deepEqual(options.calls[0], ["count", "ubaJXavier", 1, UBA_SPREADSHEET_ID, negociacao === "venda" ? "Vendas" : "Locacao"]);
    assert.deepEqual(options.calls[1], ["close"]);
    const [name, synchronization] = options.calls[2];
    assert.equal(name, negociacao === "venda" ? "vendas" : "locacao");
    assert.equal(synchronization.imobiliaria, "ubaJXavier");
    assert.equal(synchronization.spreadsheetId, UBA_SPREADSHEET_ID);
    assert.equal(synchronization.exportToSheets, exportToSheets);
    assert.equal(synchronization.outputPath, options.outputPath);
    assert.equal(synchronization.totalEsperado, 1);
    assert.equal(synchronization.vazioConfirmado, false);
    assert.equal(synchronization.preservarOcorrencias, false);
    if (negociacao === "venda") assert.deepEqual(synchronization.consolidados, options.previous);
    assert.deepEqual(synchronization.imoveisRaspados ?? synchronization.imoveis, options.previous);
  }
});

test("falhas de coleta fecham navegador e preservam JSON sem sincronizacao", async t => {
  const options = setup(t);
  const original = fs.readFileSync(options.outputPath, "utf8");
  await assert.rejects(runJXavier("venda", {
    ...options, coletar: async () => { throw new Error("Coleta incompleta"); },
  }), /Coleta incompleta/);
  assert.deepEqual(options.calls, [["close"]]);
  assert.equal(fs.readFileSync(options.outputPath, "utf8"), original);
});

test("falha de contagem nao permite sincronizar e JSON invalido rejeita antes de abrir browser", async t => {
  const options = setup(t);
  await assert.rejects(runJXavier("locacao", {
    ...options,
    registrar: async () => { throw new Error("Sem permissao"); },
    coletar: async (_browser, _project, _negociacao, context) => { await context.onCount(1); },
  }), /Sem permissao/);
  assert.deepEqual(options.calls, [["close"]]);
  fs.writeFileSync(options.outputPath, "{}");
  await assert.rejects(runJXavier("venda", options), /JSON anterior invalido/);
  assert.deepEqual(options.calls, [["close"]]);
});
