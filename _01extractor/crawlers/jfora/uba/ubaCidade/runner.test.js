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

const active = {
  linkReal: "https://corretoracidadecarinho.com.br/property/casa/", codigoBase: "CCC-Imovel n1",
  preco: 0, cidade: "", bairro: "", tipoImovel: "", dataInclusao: "2020-01-01", dataExclusao: "",
};
const retired = { ...active, linkReal: "https://corretoracidadecarinho.com.br/property/vendido/", codigoBase: "CCC-Imovel n2" };
function setup(t, mode) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cidade-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const outputPath = path.join(root, `ubaCidade${mode === "locacao" ? "Locacao" : ""}.json`);
  fs.writeFileSync(outputPath, JSON.stringify([active, retired]));
  return outputPath;
}

test("check das duas finalidades nao altera JSON, contagens ou Sheets", async t => {
  for (const mode of ["venda", "locacao"]) {
    const outputPath = setup(t, mode);
    let closed = false;
    await runProjetoUba("ubaCidade", mode, {
      check: true, outputPath, browserFactory: async () => ({ close: async () => { closed = true; } }),
      coletar: async (_browser, project, negociacao, context) => {
        assert.equal(project.collection, "ubaCidade");
        assert.equal(negociacao, mode);
        assert.equal(context.anteriores.size, 2);
        await context.onCount(1);
        return { imoveis: [active], totalEsperado: 1, totalSite: 2, excluidos: [2] };
      },
      registrar: async () => assert.fail("Nao deve registrar"),
      syncVendas: async () => assert.fail("Nao deve publicar"),
      syncLocacao: async () => assert.fail("Nao deve publicar"),
    });
    assert.equal(closed, true);
    assert.deepEqual(JSON.parse(fs.readFileSync(outputPath)), [active, retired]);
  }
});

test("sincronizadores persistem ativos, retiram indisponiveis e preservam outra finalidade e preco zero", async t => {
  const historicos = new Map();
  t.mock.module(new URL("../../../../services/googleSheets.js", import.meta.url).href, {
    namedExports: {
      ensureSheet: async (id, name) => {
        assert.equal(id, UBA_SPREADSHEET_ID);
        assert.ok(["retirados", "retiradosLocacao"].includes(name));
        return name;
      },
      readSheet: async (_id, range) => historicos.get(range.split("!")[0]) ?? [],
      writeHeader: async (_id, name, header) => historicos.set(`'${name}'`, [header]),
      appendRows: async (_id, range, data) => {
        const key = range.split("!")[0];
        historicos.set(key, [...(historicos.get(key) ?? []), ...data]);
      },
    },
  });
  for (const mode of ["venda", "locacao"]) {
    const outputPath = setup(t, mode);
    const outra = mode === "venda" ? "aluguel" : "venda";
    const preserved = ["outro-link", ...Array(19).fill(""), outra];
    let rows = [[...CABECALHO_IMOVEIS_SHEETS], preserved];
    const counts = [];
    const api = {
      ensureSheet: async (id, name) => {
        assert.equal(id, UBA_SPREADSHEET_ID);
        assert.equal(name, "ubaCidade");
        return name;
      },
      readSheet: async () => rows, clearSheet: async () => { rows = []; },
      writeHeader: async (_id, _name, header) => rows.push(header),
      writeSheet: async (_id, range, data) => {
        assert.equal(range, "'ubaCidade'!A2:U3");
        rows.push(...data);
      },
    };
    const sync = async options => {
      assert.equal(options.totalEsperado, 1);
      const exporter = (data, params) => exportToSheets(data, params, api);
      if (mode === "venda") return sincronizarVendas({ ...options, exportToSheets: exporter });
      return sincronizarLocacao({ ...options, exportToSheets: exporter });
    };
    await runProjetoUba("ubaCidade", mode, {
      outputPath, browserFactory: async () => ({ close: async () => {} }),
      coletar: async (_browser, _project, _mode, context) => {
        await context.onCount(1);
        return { imoveis: [active], totalEsperado: 1, totalSite: 2, excluidos: [2] };
      },
      registrar: async (...args) => counts.push(args), syncVendas: sync, syncLocacao: sync,
    });
    const saved = JSON.parse(fs.readFileSync(outputPath));
    assert.equal(saved.length, 1);
    assert.equal(saved[0].linkReal, active.linkReal);
    assert.equal(saved[0].preco, 0);
    assert.equal(rows.find(row => row[0] === active.linkReal)[2], 0);
    assert.ok(!rows.some(row => row[0] === retired.linkReal));
    assert.deepEqual(rows.find(row => row[0] === "outro-link"), preserved);
    const historic = outputPath.replace(/(?:Locacao)?\.json$/, `Retirados${mode === "venda" ? "Vendas" : "Locacao"}.json`);
    const withdrawn = JSON.parse(fs.readFileSync(historic));
    assert.ok(withdrawn.some(item => item.linkReal === retired.linkReal && item.dataExclusao));
    assert.deepEqual(counts[0], ["ubaCidade", 1, UBA_SPREADSHEET_ID, mode === "venda" ? "Vendas" : "Locacao"]);
  }
  for (const name of ["retirados", "retiradosLocacao"]) {
    const history = historicos.get(`'${name}'`);
    assert.equal(history.length, 2);
    assert.equal(history[1][0], retired.linkReal);
  }
});

test("falhas fecham browser sem substituir base ou publicar dados parciais", async t => {
  const outputPath = setup(t, "venda");
  let closed = false;
  await assert.rejects(runProjetoUba("ubaCidade", "venda", {
    outputPath, browserFactory: async () => ({ close: async () => { closed = true; } }),
    coletar: async () => { throw new Error("Contagem invalida"); },
    syncVendas: async () => assert.fail("Nao deve publicar"),
  }), /Contagem invalida/);
  assert.equal(closed, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(outputPath)), [active, retired]);
});
