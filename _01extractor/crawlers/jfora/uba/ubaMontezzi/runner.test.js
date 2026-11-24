import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runProjetoUba } from "../runProject.js";
import { sincronizarVendas, reconciliarVendas } from "../../_utils/vendasSincronizacao.js";
import { sincronizarLocacao, reconciliarLocacao } from "../../_utils/locacaoSincronizacao.js";
import { exportToSheets, UBA_SPREADSHEET_ID } from "../sheets.js";
import { CABECALHO_IMOVEIS_SHEETS } from "../../_utils/imoveisSheets.js";

const link = "https://www.montezzi.com.br/imovel-detalhe.php?codimo=1";
const items = [
  { linkReal: link, codigoBase: "1", preco: 100, dataInclusao: "2026-01-01", dataExclusao: "" },
  { linkReal: link, codigoBase: "1", preco: 200, dataInclusao: "2026-01-01", dataExclusao: "" },
];

test("check Montezzi nao grava contagem ou base e roteia identidade correta", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "montezzi-check-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const negociacao of ["venda", "locacao"]) {
    const outputPath = path.join(root, `ubaMontezzi${negociacao === "locacao" ? "Locacao" : ""}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(items));
    const calls = [];
    await runProjetoUba("ubaMontezzi", negociacao, {
      check: true, outputPath,
      browserFactory: async () => ({ close: async () => calls.push("close") }),
      coletar: async (_browser, project, mode, context) => {
        assert.equal(project.collection, "ubaMontezzi");
        assert.equal(mode, negociacao);
        assert.equal(context.enriquecer, false);
        await context.onCount(2);
        return { imoveis: items, totalEsperado: 2 };
      },
      registrar: async () => assert.fail("Nao deve registrar"),
      syncVendas: async () => assert.fail("Nao deve publicar"),
      syncLocacao: async () => assert.fail("Nao deve publicar"),
    });
    assert.deepEqual(calls, ["close"]);
    assert.deepEqual(JSON.parse(fs.readFileSync(outputPath)), items);
  }
});

test("sincronizadores reais persistem todas as ocorrencias em JSON e Sheets mantendo outra finalidade", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "montezzi-sync-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const negociacao of ["venda", "locacao"]) {
    const outputPath = path.join(root, `ubaMontezzi${negociacao === "locacao" ? "Locacao" : ""}.json`);
    const outra = negociacao === "venda" ? "aluguel" : "venda";
    const preserved = ["outro-link", ...Array(19).fill(""), outra];
    let rows = [[...CABECALHO_IMOVEIS_SHEETS], preserved];
    const counts = [];
    const api = {
      ensureSheet: async (id, name) => {
        assert.equal(id, UBA_SPREADSHEET_ID);
        assert.equal(name, "ubaMontezzi");
        return name;
      },
      readSheet: async () => rows,
      clearSheet: async () => { rows = []; },
      writeHeader: async (_id, _name, header) => rows.push(header),
      writeSheet: async (_id, _range, data) => rows.push(...data),
    };
    const sync = async options => {
      assert.equal(options.preservarOcorrencias, true);
      assert.equal(options.totalEsperado, 2);
      const exporter = (data, params) => exportToSheets(data, params, api);
      if (negociacao === "venda") {
        assert.deepEqual(options.consolidados, items);
        return sincronizarVendas({ ...options, exportToSheets: exporter });
      }
      return sincronizarLocacao({ ...options, exportToSheets: exporter });
    };
    for (let run = 0; run < 2; run++) {
      await runProjetoUba("ubaMontezzi", negociacao, {
        outputPath, browserFactory: async () => ({ close: async () => {} }),
        coletar: async (_browser, _project, _mode, context) => {
          await context.onCount(2);
          return { imoveis: items, totalEsperado: 2 };
        },
        registrar: async (...args) => counts.push(args),
        syncVendas: sync, syncLocacao: sync,
      });
      assert.deepEqual(JSON.parse(fs.readFileSync(outputPath)).map(item => item.preco), [100, 200]);
      const own = rows.slice(1).filter(row => row[0] === link);
      assert.deepEqual(own.map(row => row[2]), [100, 200]);
      assert.ok(own.every(row => row[20] === (negociacao === "venda" ? "venda" : "aluguel")));
      assert.deepEqual(rows.find(row => row[0] === "outro-link"), preserved);
    }
    assert.deepEqual(counts[0], ["ubaMontezzi", 2, UBA_SPREADSHEET_ID, negociacao === "venda" ? "Vendas" : "Locacao"]);
  }
});

test("preservar ocorrencias e opt-in; outras imobiliarias continuam rejeitando duplicados", () => {
  assert.throws(() => reconciliarVendas(items, [], items, "ubaGb", { totalEsperado: 2 }), /duplicadas/);
  assert.throws(() => reconciliarLocacao(items, [], "ubaGb", { totalEsperado: 2 }), /duplicados/);
  const previous = [{ ...items[0], dataInclusao: "2020-01-01" }, { linkReal: "https://example.com/retirado", codigoBase: "2", preco: 300 }];
  const opts = { totalEsperado: 2, preservarOcorrencias: true };
  for (const result of [
    reconciliarVendas(items, previous, items, "ubaMontezzi", opts),
    reconciliarLocacao(items, previous, "ubaMontezzi", opts),
  ]) {
    assert.deepEqual(result.ativos.map(item => item.preco), [100, 200]);
    assert.ok(result.ativos.every(item => item.dataInclusao === "2020-01-01"));
    assert.equal(result.retirados.length, 1);
    assert.equal(result.retirados[0].codigoBase, "2");
  }
  assert.throws(() => reconciliarVendas(items, [], items, "ubaMontezzi", { ...opts, totalEsperado: 3 }), /incompleta/);
  assert.throws(() => reconciliarLocacao(items, [], "ubaMontezzi", { ...opts, totalEsperado: 3 }), /incompleta/);
});

test("erro de coleta preserva JSON Montezzi e nao sincroniza", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "montezzi-failure-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const outputPath = path.join(root, "ubaMontezzi.json");
  fs.writeFileSync(outputPath, JSON.stringify(items));
  let closed = false;
  await assert.rejects(runProjetoUba("ubaMontezzi", "venda", {
    outputPath, browserFactory: async () => ({ close: async () => { closed = true; } }),
    coletar: async () => { throw new Error("Pagina incompleta"); },
    syncVendas: async () => assert.fail("Nao deve sincronizar"),
  }), /Pagina incompleta/);
  assert.equal(closed, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(outputPath)), items);
});
