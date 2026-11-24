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
  linkReal: "https://nogueiracarvalhoimoveis.com.br/imoveis/casa/",
  codigoBase: "6970", preco: null, cidade: "", bairro: "", tipoImovel: "",
  dataInclusao: "2020-01-01", dataExclusao: "",
}];
function setup(t, mode) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nogueira-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const outputPath = path.join(root, `ubaNogueira${mode === "locacao" ? "Locacao" : ""}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(items));
  return outputPath;
}

test("check das duas finalidades nao publica nem altera JSON, contagens ou Sheets", async t => {
  for (const mode of ["venda", "locacao"]) {
    const outputPath = setup(t, mode);
    let closed = false;
    await runProjetoUba("ubaNogueira", mode, {
      check: true, outputPath,
      browserFactory: async () => ({ close: async () => { closed = true; } }),
      coletar: async (_browser, project, negociacao, context) => {
        assert.equal(project.collection, "ubaNogueira");
        assert.equal(negociacao, mode);
        assert.deepEqual([...context.anteriores.values()], items);
        assert.equal(context.enriquecer, false);
        await context.onCount(1);
        return { imoveis: items, totalEsperado: 1 };
      },
      registrar: async () => assert.fail("Nao deve registrar"),
      syncVendas: async () => assert.fail("Nao deve publicar"),
      syncLocacao: async () => assert.fail("Nao deve publicar"),
    });
    assert.equal(closed, true);
    assert.deepEqual(JSON.parse(fs.readFileSync(outputPath)), items);
  }
});

test("sincronizadores reais gravam JSON e aba propria, mantendo vazios e a outra finalidade", async t => {
  for (const mode of ["venda", "locacao"]) {
    const outputPath = setup(t, mode);
    const outra = mode === "venda" ? "aluguel" : "venda";
    const preserved = ["outro-link", ...Array(19).fill(""), outra];
    let rows = [[...CABECALHO_IMOVEIS_SHEETS], preserved];
    const counts = [];
    const api = {
      ensureSheet: async (id, name) => {
        assert.equal(id, UBA_SPREADSHEET_ID);
        assert.equal(name, "ubaNogueira");
        return name;
      },
      readSheet: async () => rows,
      clearSheet: async () => { rows = []; },
      writeHeader: async (_id, _name, header) => rows.push(header),
      writeSheet: async (_id, range, data) => {
        assert.equal(range, "'ubaNogueira'!A2:U3");
        rows.push(...data);
      },
    };
    const sync = async options => {
      assert.equal(options.totalEsperado, 1);
      assert.equal(options.preservarOcorrencias, false);
      const exporter = (data, params) => exportToSheets(data, params, api);
      if (mode === "venda") return sincronizarVendas({ ...options, exportToSheets: exporter });
      return sincronizarLocacao({ ...options, exportToSheets: exporter });
    };
    await runProjetoUba("ubaNogueira", mode, {
      outputPath, browserFactory: async () => ({ close: async () => {} }),
      coletar: async (_browser, _project, _mode, context) => {
        await context.onCount(1);
        return { imoveis: items, totalEsperado: 1 };
      },
      registrar: async (...args) => counts.push(args), syncVendas: sync, syncLocacao: sync,
    });
    const own = rows.find(row => row[0] === items[0].linkReal);
    assert.equal(own.length, 21);
    for (const column of [2, 4, 5, 6]) assert.equal(own[column], "");
    assert.equal(own[20], mode === "venda" ? "venda" : "aluguel");
    assert.deepEqual(rows.find(row => row[0] === "outro-link"), preserved);
    const saved = JSON.parse(fs.readFileSync(outputPath))[0];
    assert.equal(saved.preco, null);
    assert.equal(saved.tipoImovel, "");
    assert.equal(saved.cidade, "");
    assert.deepEqual(counts[0], ["ubaNogueira", 1, UBA_SPREADSHEET_ID, mode === "venda" ? "Vendas" : "Locacao"]);
  }
});

test("falhas fecham browser sem substituir base ou sincronizar dados parciais", async t => {
  const outputPath = setup(t, "locacao");
  let closed = false;
  await assert.rejects(runProjetoUba("ubaNogueira", "locacao", {
    outputPath, browserFactory: async () => ({ close: async () => { closed = true; } }),
    coletar: async () => { throw new Error("Detalhe invalido"); },
    syncLocacao: async () => assert.fail("Nao deve sincronizar"),
  }), /Detalhe invalido/);
  assert.equal(closed, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(outputPath)), items);
});
