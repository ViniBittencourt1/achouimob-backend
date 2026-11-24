import assert from "node:assert/strict";
import test from "node:test";
import { CABECALHO_SHEETS_NITEROI, exportToSheets, montarLinhasNiteroi, negociacaoDaLinha } from "./sheets.js";

const item = linkReal => ({ linkReal, titulo: "T", preco: 1000, dataInclusao: "", dataExclusao: "", atualizadoEm: "" });
const linha = (link, negociacao) => [link, ...Array(19).fill(""), ...(negociacao === undefined ? [] : [negociacao])];

test("linhas legadas sem negociacao sao tratadas como venda", () => {
  assert.equal(negociacaoDaLinha(linha("a")), "venda");
  assert.equal(negociacaoDaLinha(linha("a", "aluguel")), "aluguel");
});

test("aluguel substitui so as linhas de aluguel e preserva as vendas legadas", () => {
  const atuais = [[...CABECALHO_SHEETS_NITEROI.slice(0, 20)], linha("v1"), linha("a-antigo", "aluguel"), linha("v2", "venda")];
  const linhas = montarLinhasNiteroi([item("a1")], atuais, "aluguel");
  assert.deepEqual(linhas.map(row => [row[0], row[20]]), [["v1", "venda"], ["v2", "venda"], ["a1", "aluguel"]]);
  assert.ok(linhas.every(row => row.length === 21));
});

test("venda substitui so as vendas e preserva os alugueis", () => {
  const atuais = [[...CABECALHO_SHEETS_NITEROI], linha("v-antigo", "venda"), linha("a1", "aluguel")];
  const linhas = montarLinhasNiteroi(new Map([["v1", item("v1")]]), atuais, "venda");
  assert.deepEqual(linhas.map(row => [row[0], row[20]]), [["v1", "venda"], ["a1", "aluguel"]]);
});

test("cabecalho estranho bloqueia a gravacao", () => {
  assert.throws(() => montarLinhasNiteroi([], [["outra"], ["x"]], "venda"), /incompativel/);
  assert.throws(() => montarLinhasNiteroi([], [], "permuta"), /invalida/);
});

test("exportToSheets grava cabecalho com negociacao e as linhas mescladas", async () => {
  const calls = [];
  const api = {
    ensureSheet: async (...args) => { calls.push(["ensure", ...args]); return "nitTeto"; },
    readSheet: async () => [[...CABECALHO_SHEETS_NITEROI.slice(0, 20)], linha("v1")],
    clearSheet: async (...args) => calls.push(["clear", ...args]),
    writeHeader: async (...args) => calls.push(["header", ...args]),
    writeSheet: async (...args) => calls.push(["write", ...args]),
  };
  await exportToSheets([item("a1")], { spreadsheetId: "id", sheetName: "nitTeto", negociacao: "aluguel" }, api);
  assert.deepEqual(calls[0], ["ensure", "id", "nitTeto", 21]);
  assert.equal(calls.find(call => call[0] === "header")[3].at(-1), "negociacao");
  const write = calls.find(call => call[0] === "write");
  assert.equal(write[2], "'nitTeto'!A2:U3");
  assert.deepEqual(write[3].map(row => row[20]), ["venda", "aluguel"]);
});
