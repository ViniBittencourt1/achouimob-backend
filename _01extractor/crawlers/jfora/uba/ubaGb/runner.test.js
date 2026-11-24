import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runGb } from "./runner.js";
import { runProjetoUba } from "../runProject.js";
import { exportToSheets, UBA_SPREADSHEET_ID } from "../sheets.js";

function setup(t, negociacao) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "gb-crawler-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const outputPath = path.join(directory, `ubaGb${negociacao === "locacao" ? "Locacao" : ""}.json`);
  const previous = [{ linkReal: "https://www.gbnimob.com.br/imovel/loja/1", dataInclusao: "2020-01-01" }];
  fs.writeFileSync(outputPath, JSON.stringify(previous));
  const calls = [];
  return {
    outputPath, previous, calls,
    browserFactory: async options => {
      assert.equal(options.headlessOverride, true);
      return { close: async () => calls.push("close") };
    },
    registrar: async (...args) => calls.push(["count", ...args]),
    syncVendas: async options => calls.push(["venda", options]),
    syncLocacao: async options => calls.push(["locacao", options]),
  };
}

test("GB e roteador Uba em check nao gravam contagem, JSON nem Sheets", async t => {
  for (const negociacao of ["venda", "locacao"]) {
    const options = setup(t, negociacao);
    const before = fs.readFileSync(options.outputPath, "utf8");
    await runProjetoUba("ubaGb", negociacao, {
      ...options, check: true,
      coletar: async (_browser, project, mode, context) => {
        assert.equal(project.collection, "ubaGb");
        assert.equal(mode, negociacao);
        assert.equal(context.enriquecer, false);
        assert.deepEqual([...context.anteriores.values()], options.previous);
        await context.onCount(1);
        return { imoveis: options.previous, totalEsperado: 1 };
      },
    });
    assert.deepEqual(options.calls, ["close"]);
    assert.equal(fs.readFileSync(options.outputPath, "utf8"), before);
  }
});

test("GB usa planilha Uba, identidade propria e sincronizador correto para cada finalidade", async t => {
  for (const negociacao of ["venda", "locacao"]) {
    const options = setup(t, negociacao);
    await runGb(negociacao, {
      ...options,
      coletar: async (_browser, _project, _mode, context) => {
        await context.onCount(1);
        return { imoveis: options.previous, totalEsperado: 1 };
      },
    });
    assert.deepEqual(options.calls[0], ["count", "ubaGb", 1, UBA_SPREADSHEET_ID, negociacao === "venda" ? "Vendas" : "Locacao"]);
    assert.equal(options.calls[1], "close");
    const [mode, sync] = options.calls[2];
    assert.equal(mode, negociacao);
    assert.equal(sync.imobiliaria, "ubaGb");
    assert.equal(sync.outputPath, options.outputPath);
    assert.equal(sync.spreadsheetId, UBA_SPREADSHEET_ID);
    assert.equal(sync.exportToSheets, exportToSheets);
    assert.equal(sync.totalEsperado, 1);
    assert.equal(sync.vazioConfirmado, false);
    assert.equal(sync.preservarOcorrencias, false);
    if (negociacao === "venda") assert.deepEqual(sync.consolidados, options.previous);
    assert.deepEqual(sync.imoveisRaspados ?? sync.imoveis, options.previous);
  }
});

test("falha antes da sincronizacao fecha browser e mantem base GB intacta", async t => {
  const options = setup(t, "venda");
  const before = fs.readFileSync(options.outputPath, "utf8");
  await assert.rejects(runGb("venda", {
    ...options, coletar: async () => { throw new Error("Pagina incompleta"); },
  }), /Pagina incompleta/);
  assert.deepEqual(options.calls, ["close"]);
  assert.equal(fs.readFileSync(options.outputPath, "utf8"), before);
});
