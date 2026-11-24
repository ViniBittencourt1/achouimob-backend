import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runProjetoUba } from "../runProject.js";
import { sincronizarLocacao } from "../../_utils/locacaoSincronizacao.js";
import { sincronizarVendas } from "../../_utils/vendasSincronizacao.js";
import { exportToSheets, UBA_SPREADSHEET_ID } from "../sheets.js";
import { CABECALHO_IMOVEIS_SHEETS } from "../../_utils/imoveisSheets.js";

const record = {
  linkReal: "https://www.aloisioteixeiraimoveis.com.br/imovel/123/casa-venda-uba-mg-ligacao",
  codigoBase: "CSA.: 00123", preco: 400000.75, cidade: "uba-mg", tipoImovel: "casa",
  dataInclusao: "2000-01-01", dataExclusao: "",
};
function setup(t, mode) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "uba-aloisio-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const outputPath = path.join(root, `ubaAloisio${mode === "locacao" ? "Locacao" : ""}.json`);
  fs.writeFileSync(outputPath, JSON.stringify([record]));
  return outputPath;
}

test("check das duas finalidades fecha browser e nao altera JSON, contagens ou Sheets", async t => {
  for (const mode of ["venda", "locacao"]) {
    const outputPath = setup(t, mode);
    let closed = false;
    await runProjetoUba("ubaAloisio", mode, {
      check: true, outputPath, browserFactory: async () => ({ close: async () => { closed = true; } }),
      coletar: async (_browser, project, negociacao, context) => {
        assert.equal(project.collection, "ubaAloisio");
        assert.equal(negociacao, mode);
        assert.equal(context.anteriores.get(record.linkReal).dataInclusao, "2000-01-01");
        await context.onCount(1);
        return { imoveis: [record], totalEsperado: 1 };
      },
      registrar: async () => assert.fail("Nao deve registrar"),
      syncVendas: async () => assert.fail("Nao deve publicar"),
      syncLocacao: async () => assert.fail("Nao deve publicar"),
    });
    assert.equal(closed, true);
    assert.deepEqual(JSON.parse(fs.readFileSync(outputPath)), [record]);
  }
});

test("venda persiste com sincronizador real e Sheets simulado preservando aluguel", async t => {
  const outputPath = setup(t, "venda");
  const rental = ["outro-aluguel", ...Array(19).fill(""), "aluguel"];
  let rows = [[...CABECALHO_IMOVEIS_SHEETS], rental];
  const api = {
    ensureSheet: async (id, name) => {
      assert.equal(id, UBA_SPREADSHEET_ID);
      assert.equal(name, "ubaAloisio");
      return name;
    },
    readSheet: async () => rows, clearSheet: async () => { rows = []; },
    writeHeader: async (_id, _name, header) => rows.push(header),
    writeSheet: async (_id, _range, data) => rows.push(...data),
  };
  await runProjetoUba("ubaAloisio", "venda", {
    outputPath, browserFactory: async () => ({ close: async () => {} }),
    coletar: async () => ({ imoveis: [record], totalEsperado: 1 }),
    syncVendas: async options => sincronizarVendas({
      ...options, exportToSheets: (data, params) => exportToSheets(data, params, api),
    }),
  });
  assert.equal(JSON.parse(fs.readFileSync(outputPath))[0].preco, 400000.75);
  assert.deepEqual(rows.find(row => row[0] === "outro-aluguel"), rental);
  assert.equal(rows.find(row => row[0] === record.linkReal)[20], "venda");
});

test("aluguel zero confirmado retira anteriores sem tocar vendas ou API real", async t => {
  const history = [];
  t.mock.module(new URL("../../../../services/googleSheets.js", import.meta.url).href, {
    namedExports: {
      ensureSheet: async (id, name) => {
        assert.equal(id, UBA_SPREADSHEET_ID);
        assert.equal(name, "retiradosLocacao");
        return name;
      },
      readSheet: async () => history,
      writeHeader: async (_id, _name, header) => history.push(header),
      appendRows: async (_id, _range, data) => history.push(...data),
    },
  });
  const outputPath = setup(t, "locacao");
  const sale = [record.linkReal, ...Array(19).fill(""), "venda"];
  let rows = [[...CABECALHO_IMOVEIS_SHEETS], sale, ["aluguel-anterior", ...Array(19).fill(""), "aluguel"]];
  const api = {
    ensureSheet: async (_id, name) => name,
    readSheet: async () => rows, clearSheet: async () => { rows = []; },
    writeHeader: async (_id, _name, header) => rows.push(header),
    writeSheet: async (_id, _range, data) => rows.push(...data),
  };
  await runProjetoUba("ubaAloisio", "locacao", {
    outputPath, browserFactory: async () => ({ close: async () => {} }),
    coletar: async () => ({ imoveis: [], totalEsperado: 0, vazioConfirmado: true }),
    syncLocacao: async options => {
      assert.equal(options.vazioConfirmado, true);
      return sincronizarLocacao({ ...options, exportToSheets: (data, params) => exportToSheets(data, params, api) });
    },
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(outputPath)), []);
  assert.deepEqual(rows, [[...CABECALHO_IMOVEIS_SHEETS], sale]);
  assert.equal(history[1][0], record.linkReal);
  const retired = JSON.parse(fs.readFileSync(outputPath.replace("Locacao.json", "RetiradosLocacao.json")));
  assert.equal(retired.length, 1);
  assert.ok(retired[0].dataExclusao);
});

test("zero nao confirmado e erros preservam base e fecham navegador", async t => {
  const outputPath = setup(t, "locacao");
  await assert.rejects(runProjetoUba("ubaAloisio", "locacao", {
    outputPath, browserFactory: async () => ({ close: async () => {} }),
    coletar: async () => ({ imoveis: [], totalEsperado: 0 }),
    syncLocacao: async options => {
      assert.equal(options.vazioConfirmado, false);
      return sincronizarLocacao({ ...options, exportToSheets: async () => assert.fail("Nao deve publicar") });
    },
  }), /vazi|zero/i);
  let closed = false;
  await assert.rejects(runProjetoUba("ubaAloisio", "venda", {
    outputPath, browserFactory: async () => ({ close: async () => { closed = true; } }),
    coletar: async () => { throw new Error("Detalhe divergente"); },
    syncVendas: async () => assert.fail("Nao deve publicar"),
  }), /Detalhe divergente/);
  assert.equal(closed, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(outputPath)), [record]);
});
