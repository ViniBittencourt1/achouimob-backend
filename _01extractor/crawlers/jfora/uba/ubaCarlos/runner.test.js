import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runProjetoUba } from "../runProject.js";
import { sincronizarVendas } from "../../_utils/vendasSincronizacao.js";
import { sincronizarLocacao } from "../../_utils/locacaoSincronizacao.js";
import { exportToSheets, UBA_SPREADSHEET_ID } from "../sheets.js";
import { CABECALHO_IMOVEIS_SHEETS } from "../../_utils/imoveisSheets.js";

const items = [{
  linkReal: "https://www.carloscorretordeimoveis.com/imovel.php?id=367",
  codigoBase: "1074", preco: 170000.75, cidade: "", bairro: "zona-rural",
  dataInclusao: "2020-01-01", dataExclusao: "",
}];
function setup(t, mode) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "carlos-crawler-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const outputPath = path.join(root, `ubaCarlos${mode === "locacao" ? "Locacao" : ""}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(items));
  return outputPath;
}

test("check das duas finalidades nao grava contagem, JSON ou Sheets e fecha browser", async t => {
  for (const mode of ["venda", "locacao"]) {
    const outputPath = setup(t, mode);
    const calls = [];
    await runProjetoUba("ubaCarlos", mode, {
      check: true, outputPath,
      browserFactory: async () => ({ close: async () => calls.push("close") }),
      coletar: async (_browser, project, negociacao, context) => {
        assert.equal(project.collection, "ubaCarlos");
        assert.equal(negociacao, mode);
        assert.equal(context.enriquecer, false);
        assert.deepEqual([...context.anteriores.values()], items);
        await context.onCount(1);
        return { imoveis: items, totalEsperado: 1 };
      },
      registrar: async () => assert.fail("Nao deve registrar"),
      syncVendas: async () => assert.fail("Nao deve publicar"),
      syncLocacao: async () => assert.fail("Nao deve publicar"),
    });
    assert.deepEqual(calls, ["close"]);
    assert.deepEqual(JSON.parse(fs.readFileSync(outputPath)), items);
  }
});

test("fluxo real sincroniza Carlos em JSON e aba propria mantendo a outra finalidade", async t => {
  for (const mode of ["venda", "locacao"]) {
    const outputPath = setup(t, mode);
    const outra = mode === "venda" ? "aluguel" : "venda";
    const preserved = ["outro-link", ...Array(19).fill(""), outra];
    let rows = [[...CABECALHO_IMOVEIS_SHEETS], preserved];
    const counts = [];
    const api = {
      ensureSheet: async (id, name) => {
        assert.equal(id, UBA_SPREADSHEET_ID);
        assert.equal(name, "ubaCarlos");
        return name;
      },
      readSheet: async () => rows,
      clearSheet: async () => { rows = []; },
      writeHeader: async (_id, _name, header) => rows.push(header),
      writeSheet: async (_id, range, data) => {
        assert.equal(range, "'ubaCarlos'!A2:U3");
        rows.push(...data);
      },
    };
    const sync = async options => {
      assert.equal(options.preservarOcorrencias, false);
      assert.equal(options.totalEsperado, 1);
      const exporter = (data, params) => exportToSheets(data, params, api);
      if (mode === "venda") return sincronizarVendas({ ...options, exportToSheets: exporter });
      return sincronizarLocacao({ ...options, exportToSheets: exporter });
    };
    await runProjetoUba("ubaCarlos", mode, {
      outputPath, browserFactory: async () => ({ close: async () => {} }),
      coletar: async (_browser, _project, _mode, context) => {
        await context.onCount(1);
        return { imoveis: items, totalEsperado: 1 };
      },
      registrar: async (...args) => counts.push(args),
      syncVendas: sync, syncLocacao: sync,
    });
    const own = rows.find(row => row[0] === items[0].linkReal);
    assert.equal(own[2], 170000.75);
    assert.equal(own[6], "");
    assert.equal(own[13], "1074");
    assert.equal(own[20], mode === "venda" ? "venda" : "aluguel");
    assert.deepEqual(rows.find(row => row[0] === "outro-link"), preserved);
    assert.equal(JSON.parse(fs.readFileSync(outputPath))[0].cidade, "");
    assert.deepEqual(counts[0], ["ubaCarlos", 1, UBA_SPREADSHEET_ID, mode === "venda" ? "Vendas" : "Locacao"]);
  }
});

test("falhas de coleta fecham browser sem sincronizar ou substituir base", async t => {
  const outputPath = setup(t, "venda");
  let closed = false;
  await assert.rejects(runProjetoUba("ubaCarlos", "venda", {
    outputPath, browserFactory: async () => ({ close: async () => { closed = true; } }),
    coletar: async () => { throw new Error("Detalhe invalido"); },
    syncVendas: async () => assert.fail("Nao deve sincronizar"),
  }), /Detalhe invalido/);
  assert.equal(closed, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(outputPath)), items);
});
