import assert from "node:assert/strict";
import { test } from "node:test";
import { exportToSheets } from "./sheets.js";
import { RIO_SPREADSHEET_ID } from "./projects.js";
import { CABECALHO_IMOVEIS_SHEETS } from "../_utils/imoveisSheets.js";
import { arquivoPrincipalVendas, arquivoPrincipalLocacao, separarVendas } from "../_utils/vendasSincronizacao.js";

test("Rio usa planilha propria, vinte campos e negociacao, preservando a outra finalidade", async () => {
  for (const negociacao of ["venda", "aluguel"]) {
    const outra = negociacao === "venda" ? "aluguel" : "venda";
    const previous = ["preservado", ...Array(19).fill(""), outra];
    let rows;
    await exportToSheets([{ linkReal: "novo", preco: 1234.56 }], { sheetName: "rioCasalta", negociacao }, {
      ensureSheet: async (id, name, columns) => {
        assert.equal(id, RIO_SPREADSHEET_ID);
        assert.equal(name, "rioCasalta");
        assert.equal(columns, 21);
        return name;
      },
      readSheet: async () => [[...CABECALHO_IMOVEIS_SHEETS], previous],
      clearSheet: async () => {},
      writeHeader: async (_id, _name, header) => assert.deepEqual(header, CABECALHO_IMOVEIS_SHEETS),
      writeSheet: async (_id, _range, data) => { rows = data; },
    });
    assert.ok(rows.every(row => row.length === 21));
    assert.deepEqual(rows.find(row => row[0] === "preservado"), previous);
    assert.equal(rows.find(row => row[0] === "novo")[20], negociacao);
  }
});

test("cabecalho desconhecido bloqueia limpeza e nomes de arquivos Rio nao misturam finalidades", async () => {
  await assert.rejects(exportToSheets([], { sheetName: "rioCasalta" }, {
    ensureSheet: async () => "rioCasalta", readSheet: async () => [["errado"]],
    clearSheet: async () => assert.fail("Nao deve limpar"),
  }), /incompativel/);
  assert.equal(arquivoPrincipalVendas("rioCasalta.json"), true);
  assert.equal(arquivoPrincipalVendas("rioCasaltaLocacao.json"), false);
  assert.equal(arquivoPrincipalLocacao("rioCasaltaLocacao.json"), true);
  for (const name of ["rioCasaltaRetiradosVendas.json", "rioCasaltaHistorico.json"]) {
    assert.equal(arquivoPrincipalVendas(name), false);
    assert.equal(arquivoPrincipalLocacao(name), false);
  }
  assert.equal(separarVendas([{ linkReal: "https://example.com/imovel/1" }], "rioCasalta").ativos.length, 1);
});
