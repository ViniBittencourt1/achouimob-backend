import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NITEROI_SPREADSHEET_ID } from "../niteroi/projects.js";
import { JF_SPREADSHEET_ID } from "./jfSheetsConfig.js";

let rows = [];
let failure = false;
const calls = [];
mock.module("../../../services/googleSheets.js", {
  namedExports: {
    ensureSheet: async (...args) => { calls.push(["ensure", ...args]); return args[1]; },
    readSheet: async (...args) => { calls.push(["read", ...args]); return rows; },
    writeHeader: async (_id, _title, header) => { calls.push(["header", header]); rows[0] = header; },
    writeSheets: async (id, data) => {
      calls.push(["write", id, data]);
      if (failure) throw new Error("Sheets indisponivel");
      for (const item of data) {
        const match = /!([AC])(\d+)/.exec(item.range);
        const index = Number(match[2]) - 1;
        if (match[1] === "C") rows[index][2] = item.values[0][0];
        else rows[index] = [...item.values[0]];
      }
    },
    writeSheet: async () => { throw new Error("Niteroi deve gravar as tres colunas em lote."); },
  },
});
const { registrarTotalLocacao } = await import("./locacaoContagem.js");
const { registrarTotalVendas, registrarTotaisVendas } = await import("./vendasContagem.js");

test("venda e aluguel do mesmo projeto usam linhas distintas e atualizam sem duplicar", async () => {
  rows = [];
  calls.length = 0;
  await registrarTotalVendas("nitTeto", 100);
  await registrarTotalLocacao("nitTeto", 20);
  await registrarTotalVendas("nitTeto", 101);
  await registrarTotalLocacao("nitTeto", 0);
  assert.deepEqual(rows, [["Projeto", "Quantidade", "tipo"], ["nitTeto", 101, "venda"], ["nitTeto", 0, "aluguel"]]);
  assert.ok(calls.filter(call => call[0] === "ensure").every(call =>
    call[1] === NITEROI_SPREADSHEET_ID && call[2] === "retorno" && call[3] === 3));
});

test("linhas antigas sao identificadas como vendas sem perder quantidade", async () => {
  rows = [["Projeto", "Quantidade"], ["nitNova", 2405], ["nitTeto", 100]];
  await registrarTotalLocacao("nitNova", 37);
  assert.deepEqual(rows.slice(1), [["nitNova", 2405, "venda"], ["nitTeto", 100, "venda"], ["nitNova", 37, "aluguel"]]);
  await registrarTotaisVendas([{ projeto: "nitNova", total: 2400 }, { projeto: "nitTeto", total: 90 }]);
  assert.deepEqual(rows.slice(1), [["nitNova", 2400, "venda"], ["nitTeto", 90, "venda"], ["nitNova", 37, "aluguel"]]);
});

test("negociacao desconhecida ou quantidade invalida impedem gravacao", async () => {
  rows = [["Projeto", "Quantidade", "negociacao"], ["nitTeto", 20, "permuta"]];
  calls.length = 0;
  await assert.rejects(registrarTotalLocacao("nitTeto", 30), /Negociacao invalida/);
  await assert.rejects(registrarTotalVendas("nitTeto", -1), /invalido/);
  assert.equal(calls.some(call => call[0] === "write"), false);
});

test("cabecalho existente tipo e aceito sem alterar outras contagens", async () => {
  rows = [["Projeto", "Quantidade", "tipo"], ["jfAlicerce", 1087, "venda"], ["nitMarchipp", 298, "venda"]];
  await registrarTotalVendas("nitMarchipp", 300);
  await registrarTotalLocacao("nitMarchipp", 25);
  await registrarTotalLocacao("nitMarchipp", 24);
  assert.deepEqual(rows, [
    ["Projeto", "Quantidade", "tipo"],
    ["jfAlicerce", 1087, "venda"],
    ["nitMarchipp", 300, "venda"],
    ["nitMarchipp", 24, "aluguel"],
  ]);
});

test("cabecalhos incompativeis continuam bloqueados sem escrita", async () => {
  for (const header of [
    ["Projeto", "Quantidade", "observacao"],
    ["Imovel", "Quantidade", "tipo"],
    ["Projeto", "Preco", "tipo"],
  ]) {
    rows = [header, ["nitMarchipp", 298, "venda"]];
    const original = structuredClone(rows);
    calls.length = 0;
    await assert.rejects(registrarTotalVendas("nitMarchipp", 300), /Cabecalho de retorno incompativel/);
    assert.deepEqual(rows, original);
    assert.equal(calls.some(call => ["header", "write"].includes(call[0])), false);
  }
});

test("erro de gravacao e propagado e a proxima tentativa continua funcionando", async () => {
  rows = [];
  failure = true;
  try {
    await assert.rejects(registrarTotalLocacao("nitTeto", 20), /Sheets indisponivel/);
  } finally {
    failure = false;
  }
  await registrarTotalLocacao("nitTeto", 20);
  assert.deepEqual(rows[1], ["nitTeto", 20, "aluguel"]);
});

test("JF tambem grava venda e aluguel no retorno com tipo e sem sobrescrever a outra modalidade", async () => {
  rows = [["Projeto", "Quantidade"], ["jfHolder", 18]];
  calls.length = 0;
  await registrarTotalLocacao("jfHolder", 2);
  await registrarTotalVendas("jfHolder", 19);
  await registrarTotalLocacao("jfHolder", 3);
  assert.deepEqual(rows, [
    ["Projeto", "Quantidade", "tipo"], ["jfHolder", 19, "venda"], ["jfHolder", 3, "aluguel"],
  ]);
  assert.ok(calls.filter(call => call[0] === "ensure").every(call => call[1] === JF_SPREADSHEET_ID && call[2] === "retorno"));
});

test("lote misto separa JF e Niteroi nas respectivas planilhas", async () => {
  rows = [];
  calls.length = 0;
  await registrarTotaisVendas([{ projeto: "jfHolder", total: 18 }, { projeto: "nitTeto", total: 100 }]);
  const writes = calls.filter(call => call[0] === "write");
  assert.equal(writes.length, 2);
  assert.equal(writes[0][1], JF_SPREADSHEET_ID);
  assert.equal(writes[1][1], NITEROI_SPREADSHEET_ID);
  assert.ok(writes[0][2].some(item => item.values[0][0] === "jfHolder"));
  assert.ok(writes[1][2].some(item => item.values[0][0] === "nitTeto"));
});
