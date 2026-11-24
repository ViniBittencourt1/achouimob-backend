import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runProjetoUba } from "../runProject.js";
import { runCrawlerUba } from "../runner.js";
import { project } from "./config.js";
import { sincronizarVendas } from "../../_utils/vendasSincronizacao.js";
import { sincronizarLocacao } from "../../_utils/locacaoSincronizacao.js";
import { exportToSheets, UBA_SPREADSHEET_ID } from "../sheets.js";
import { CABECALHO_IMOVEIS_SHEETS } from "../../_utils/imoveisSheets.js";

const item = {
  linkReal: "https://www.remax.com.br/pt-br/imoveis/casa/alugar/uba/860511003-1",
  codigoBase: "860511003-1", preco: 0, cidade: "uba-mg", tipoImovel: "casa",
  dataInclusao: "2020-01-01", dataExclusao: "",
};
function setup(t, mode) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "uba-remax-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const outputPath = path.join(root, `ubaRemax${mode === "locacao" ? "Locacao" : ""}.json`);
  fs.writeFileSync(outputPath, JSON.stringify([item]));
  return outputPath;
}

test("check das duas finalidades nao publica nem altera JSON, contagens ou Sheets", async t => {
  for (const mode of ["venda", "locacao"]) {
    const outputPath = setup(t, mode);
    let closed = false;
    await runProjetoUba("ubaRemax", mode, {
      check: true, outputPath, browserFactory: async () => ({ close: async () => { closed = true; } }),
      coletar: async (_browser, project, negociacao, context) => {
        assert.equal(project.collection, "ubaRemax");
        assert.equal(negociacao, mode);
        assert.equal(context.anteriores.size, 1);
        await context.onCount(0);
        return { imoveis: [], totalEsperado: 0, vazioConfirmado: true };
      },
      registrar: async () => assert.fail("Nao deve registrar"),
      syncVendas: async () => assert.fail("Nao deve publicar"),
      syncLocacao: async () => assert.fail("Nao deve publicar"),
    });
    assert.equal(closed, true);
    assert.deepEqual(JSON.parse(fs.readFileSync(outputPath)), [item]);
  }
});

test("aluguel zero confirmado retira registros anteriores com API simulada e preserva vendas", async t => {
  const historicos = new Map();
  t.mock.module(new URL("../../../../services/googleSheets.js", import.meta.url).href, {
    namedExports: {
      ensureSheet: async (id, name) => {
        assert.equal(id, UBA_SPREADSHEET_ID);
        assert.equal(name, "retiradosLocacao");
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
  const outputPath = setup(t, "locacao");
  const sale = [item.linkReal.replace("/alugar/", "/venda/"), ...Array(19).fill(""), "venda"];
  let rows = [[...CABECALHO_IMOVEIS_SHEETS], sale, [item.linkReal, ...Array(19).fill(""), "aluguel"]];
  const api = {
    ensureSheet: async (id, name) => {
      assert.equal(id, UBA_SPREADSHEET_ID);
      assert.equal(name, "ubaRemax");
      return name;
    },
    readSheet: async () => rows, clearSheet: async () => { rows = []; },
    writeHeader: async (_id, _name, header) => rows.push(header),
    writeSheet: async (_id, _range, data) => rows.push(...data),
  };
  await runProjetoUba("ubaRemax", "locacao", {
    outputPath, browserFactory: async () => ({ close: async () => {} }),
    coletar: async () => ({ imoveis: [], totalEsperado: 0, vazioConfirmado: true }),
    syncLocacao: async options => {
      assert.equal(options.vazioConfirmado, true);
      return sincronizarLocacao({
        ...options, exportToSheets: (data, params) => exportToSheets(data, params, api),
      });
    },
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(outputPath)), []);
  assert.deepEqual(rows, [[...CABECALHO_IMOVEIS_SHEETS], sale]);
  const history = JSON.parse(fs.readFileSync(outputPath.replace("Locacao.json", "RetiradosLocacao.json")));
  assert.equal(history.length, 1);
  assert.equal(history[0].linkReal, item.linkReal);
  assert.ok(history[0].dataExclusao);
  assert.equal(historicos.get("'retiradosLocacao'")[1][0], item.linkReal);
});

test("zero nao confirmado continua bloqueado e permissao nao afeta outras agencias", async t => {
  for (const [enabled, confirmed, expected] of [[true, false, false], [false, true, false], [true, true, true]]) {
    const outputPath = setup(t, "locacao");
    await runCrawlerUba({ ...project, permitirLocacaoVaziaConfirmada: enabled }, "locacao", {
      outputPath, browserFactory: async () => ({ close: async () => {} }),
      coletar: async () => ({ imoveis: [], totalEsperado: 0, vazioConfirmado: confirmed }),
      syncLocacao: async options => {
        assert.equal(options.vazioConfirmado, expected);
        if (!expected) await assert.rejects(sincronizarLocacao({
          ...options, exportToSheets: async () => assert.fail("Nao deve publicar"),
        }), /vazi|zero/i);
      },
    });
    assert.deepEqual(JSON.parse(fs.readFileSync(outputPath)), [item]);
  }
  await runProjetoUba("ubaRemax", "venda", {
    outputPath: setup(t, "venda"), browserFactory: async () => ({ close: async () => {} }),
    coletar: async () => ({ imoveis: [], totalEsperado: 0, vazioConfirmado: true }),
    syncVendas: async options => assert.equal(options.vazioConfirmado, false),
  });
});

test("vendas usam sincronizador real, preco zero e aba propria sem rede", async t => {
  const outputPath = setup(t, "venda");
  let rows = [[...CABECALHO_IMOVEIS_SHEETS]];
  const counts = [];
  const api = {
    ensureSheet: async (id, name) => {
      assert.equal(id, UBA_SPREADSHEET_ID);
      assert.equal(name, "ubaRemax");
      return name;
    },
    readSheet: async () => rows, clearSheet: async () => { rows = []; },
    writeHeader: async (_id, _name, header) => rows.push(header),
    writeSheet: async (_id, _range, data) => rows.push(...data),
  };
  await runProjetoUba("ubaRemax", "venda", {
    outputPath, browserFactory: async () => ({ close: async () => {} }),
    coletar: async (_browser, _project, _mode, context) => {
      await context.onCount(1);
      return { imoveis: [item], totalEsperado: 1, vazioConfirmado: false };
    },
    registrar: async (...args) => counts.push(args),
    syncVendas: async options => {
      assert.equal(options.vazioConfirmado, false);
      return sincronizarVendas({ ...options, exportToSheets: (data, params) => exportToSheets(data, params, api) });
    },
  });
  assert.equal(rows[1][2], 0);
  assert.equal(rows[1][20], "venda");
  assert.equal(JSON.parse(fs.readFileSync(outputPath))[0].preco, 0);
  assert.deepEqual(counts[0], ["ubaRemax", 1, UBA_SPREADSHEET_ID, "Vendas"]);
});

test("falhas de coleta fecham browser sem gravar ou sincronizar", async t => {
  const outputPath = setup(t, "locacao");
  let closed = false;
  await assert.rejects(runProjetoUba("ubaRemax", "locacao", {
    outputPath, browserFactory: async () => ({ close: async () => { closed = true; } }),
    coletar: async () => { throw new Error("API indisponivel"); },
    syncLocacao: async () => assert.fail("Nao deve publicar"),
  }), /API indisponivel/);
  assert.equal(closed, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(outputPath)), [item]);
});
