import assert from "node:assert/strict";
import { test } from "node:test";
import { exportToSheets, UBA_SPREADSHEET_ID } from "./sheets.js";
import { CABECALHO_IMOVEIS_SHEETS } from "../_utils/imoveisSheets.js";

test("Sheets de Uba usa vinte campos mais negociacao e preserva a outra finalidade", async () => {
  for (const [sheetName, negociacao] of [
    ["ubaJXavier", "venda"], ["ubaJXavier", "aluguel"],
    ["ubaGb", "venda"], ["ubaGb", "aluguel"],
    ["ubaMontezzi", "venda"], ["ubaMontezzi", "aluguel"],
    ["ubaCarlos", "venda"], ["ubaCarlos", "aluguel"],
    ["ubaNogueira", "venda"], ["ubaNogueira", "aluguel"],
    ["ubaArtolex", "venda"], ["ubaArtolex", "aluguel"],
    ["ubaCidade", "venda"], ["ubaCidade", "aluguel"],
    ["ubaRemax", "venda"], ["ubaRemax", "aluguel"],
    ["ubaAloisio", "venda"], ["ubaAloisio", "aluguel"],
  ]) {
    const outra = negociacao === "venda" ? "aluguel" : "venda";
    const calls = [];
    const previous = ["anuncio-preservado", ...Array(19).fill(""), outra];
    const api = {
      ensureSheet: async (id, title, columns) => {
        assert.equal(id, UBA_SPREADSHEET_ID);
        assert.equal(title, sheetName);
        assert.equal(columns, 21);
        return title;
      },
      readSheet: async () => [[...CABECALHO_IMOVEIS_SHEETS], previous],
      clearSheet: async () => calls.push("clear"),
      writeHeader: async (_id, _title, header) => assert.deepEqual(header, CABECALHO_IMOVEIS_SHEETS),
      writeSheet: async (_id, range, rows) => {
        assert.equal(range, `'${sheetName}'!A2:U3`);
        assert.ok(rows.every(row => row.length === 21));
        assert.ok(rows.some(row => row[0] === "novo" && row[20] === negociacao));
        assert.deepEqual(rows.find(row => row[0] === "anuncio-preservado"), previous);
        calls.push("write");
      },
    };
    const data = [{ linkReal: "novo", preco: 1234.56 }];
    await exportToSheets(negociacao === "venda" ? new Map([["novo", data[0]]]) : data, {
      sheetName, negociacao,
    }, api);
    assert.deepEqual(calls, ["clear", "write"]);
  }
});

test("cabecalho incompativel impede limpar a planilha de Uba", async () => {
  await assert.rejects(exportToSheets([], { sheetName: "ubaJXavier" }, {
    ensureSheet: async () => "ubaJXavier",
    readSheet: async () => [["cabecalho-incompativel"]],
    clearSheet: async () => assert.fail("Nao deveria limpar"),
  }), /incompativel/);
});
