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

const link = "https://www.artolex.com.br/?a=ver&id=881";
const record = preco => ({
  linkReal: link, codigoBase: "881", preco, cidade: "uba-mg", tipoImovel: "loja",
  dataInclusao: "2020-01-01", dataExclusao: "",
});
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "artolex-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return mode => path.join(root, `ubaArtolex${mode === "locacao" ? "Locacao" : ""}.json`);
}

test("check das duas finalidades nao grava contagens, JSON ou Sheets e fecha navegador", async t => {
  const output = setup(t);
  for (const mode of ["venda", "locacao"]) {
    const outputPath = output(mode);
    fs.writeFileSync(outputPath, JSON.stringify([record(0)]));
    let closed = false;
    await runProjetoUba("ubaArtolex", mode, {
      check: true, outputPath, browserFactory: async () => ({ close: async () => { closed = true; } }),
      coletar: async (_browser, project, negociacao, context) => {
        assert.equal(project.collection, "ubaArtolex");
        assert.equal(negociacao, mode);
        assert.equal(context.enriquecer, false);
        assert.equal(context.anteriores.get(link).preco, 0);
        await context.onCount(1);
        return { imoveis: [record(0)], totalEsperado: 1 };
      },
      registrar: async () => assert.fail("Nao deve registrar"),
      syncVendas: async () => assert.fail("Nao deve publicar"),
      syncLocacao: async () => assert.fail("Nao deve publicar"),
    });
    assert.equal(closed, true);
    assert.deepEqual(JSON.parse(fs.readFileSync(outputPath)), [record(0)]);
  }
});

test("mesmo link persiste duas vezes no Sheets com precos independentes e em JSONs separados", async t => {
  const output = setup(t);
  let rows = [[...CABECALHO_IMOVEIS_SHEETS]];
  const counts = [];
  const api = {
    ensureSheet: async (id, name) => {
      assert.equal(id, UBA_SPREADSHEET_ID);
      assert.equal(name, "ubaArtolex");
      return name;
    },
    readSheet: async () => rows,
    clearSheet: async () => { rows = []; },
    writeHeader: async (_id, _name, header) => rows.push(header),
    writeSheet: async (_id, _range, data) => rows.push(...data),
  };
  for (const [mode, price] of [["venda", 0], ["locacao", 10000.75], ["venda", 0], ["locacao", 0]]) {
    const sync = async options => {
      assert.equal(options.totalEsperado, 1);
      assert.equal(options.preservarOcorrencias, false);
      const exporter = (data, params) => exportToSheets(data, params, api);
      if (mode === "venda") return sincronizarVendas({ ...options, exportToSheets: exporter });
      return sincronizarLocacao({ ...options, exportToSheets: exporter });
    };
    await runProjetoUba("ubaArtolex", mode, {
      outputPath: output(mode), browserFactory: async () => ({ close: async () => {} }),
      coletar: async (_browser, _project, _mode, context) => {
        await context.onCount(1);
        return { imoveis: [record(price)], totalEsperado: 1 };
      },
      registrar: async (...args) => counts.push(args), syncVendas: sync, syncLocacao: sync,
    });
    assert.equal(rows.find(row => row[0] === link && row[20] === (mode === "venda" ? "venda" : "aluguel"))[2], price);
    assert.equal(JSON.parse(fs.readFileSync(output(mode)))[0].preco, price);
    if (mode === "locacao") assert.equal(rows.filter(row => row[0] === link).length, 2);
    assert.deepEqual(counts.at(-1), ["ubaArtolex", 1, UBA_SPREADSHEET_ID, mode === "venda" ? "Vendas" : "Locacao"]);
  }
  assert.equal(rows.find(row => row[20] === "venda")[2], 0);
  assert.equal(rows.find(row => row[20] === "aluguel")[2], 0);
});

test("falhas de coleta fecham browser sem substituir base ou publicar dados parciais", async t => {
  const outputPath = setup(t)("venda");
  fs.writeFileSync(outputPath, JSON.stringify([record(0)]));
  let closed = false;
  await assert.rejects(runProjetoUba("ubaArtolex", "venda", {
    outputPath, browserFactory: async () => ({ close: async () => { closed = true; } }),
    coletar: async () => { throw new Error("Detalhe invalido"); },
    syncVendas: async () => assert.fail("Nao deve publicar"),
  }), /Detalhe invalido/);
  assert.equal(closed, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(outputPath)), [record(0)]);
});
