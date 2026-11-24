import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { JF_SPREADSHEET_ID } from "./jfSheetsConfig.js";
import { CABECALHO_IMOVEIS_SHEETS, exportarLinhasSheets, mesclarLinhasSheets } from "./imoveisSheets.js";

const linha = (link, negociacao) => [link, ...Array(19).fill(""), ...(negociacao ? [negociacao] : [])];

function planilha() {
  let rows = [];
  const calls = [];
  return {
    calls,
    rows: () => rows,
    api: {
      ensureSheet: async (...args) => { calls.push(["ensure", ...args]); return args[1]; },
      readSheet: async (...args) => { calls.push(["read", ...args]); return rows; },
      clearSheet: async (...args) => { calls.push(["clear", ...args]); rows = []; },
      writeHeader: async (_id, _sheet, header) => { rows[0] = header; },
      writeSheet: async (_id, _range, data) => { rows.push(...data); },
    },
  };
}

test("rejeita cabecalho e negociacao desconhecidos antes de apagar dados", async () => {
  const api = planilha();
  api.api.readSheet = async () => [["linkReal", "coluna errada"]];
  await assert.rejects(exportarLinhasSheets([], { spreadsheetId: "teste", sheetName: "jfTeste" }, api.api), /incompativel/);
  assert.equal(api.calls.some(call => call[0] === "clear"), false);
  assert.throws(() => mesclarLinhasSheets([], [CABECALHO_IMOVEIS_SHEETS, linha("x", "permuta")], "venda"), /desconhecida/);
});

test("aviso Erro no site sem link e substituido quando a coleta volta", () => {
  const warning = linha("", "Erro no site");
  warning[19] = "01/11/2026 12:43:08";
  for (const negociacao of ["venda", "aluguel"]) {
    assert.deepEqual(mesclarLinhasSheets([linha("novo")], [CABECALHO_IMOVEIS_SHEETS, warning], negociacao),
      [linha("novo", negociacao)]);
  }
  assert.throws(() => mesclarLinhasSheets([], [CABECALHO_IMOVEIS_SHEETS, linha("anuncio", "Erro no site")], "venda"), /desconhecida/);
});

test("vendas legadas sao preservadas e marcadas ao receber o primeiro aluguel", () => {
  const result = mesclarLinhasSheets([linha("aluguel")], [CABECALHO_IMOVEIS_SHEETS.slice(0, 20), linha("venda")], "aluguel");
  assert.deepEqual(result.map(row => [row[0], row[20]]), [["venda", "venda"], ["aluguel", "aluguel"]]);
  assert.ok(result.every(row => row.length === 21));
});

test("Universal acrescenta campos de taxas sem deslocar as colunas existentes", () => {
  const extras = ["precoCondominio", "precoIptu", "precoTotal", "precoOutros"];
  const aluguel = [...linha("aluguel"), 1300, 390, 6050, 360];
  const rows = mesclarLinhasSheets(
    [aluguel],
    [CABECALHO_IMOVEIS_SHEETS, linha("venda", "venda")],
    "aluguel",
    extras
  );
  assert.deepEqual(rows.map(row => [row[0], row[2], row[20], row[21], row[22], row[23], row[24]]), [
    ["venda", "", "venda", "", "", "", ""],
    ["aluguel", "", "aluguel", 1300, 390, 6050, 360],
  ]);
});

test("Universal migra as taxas anteriores preservando os valores ao acrescentar precoOutros", () => {
  const oldExtras = ["precoCondominio", "precoIptu", "precoTotal"];
  const newExtras = [...oldExtras, "precoOutros"];
  const oldHeader = [...CABECALHO_IMOVEIS_SHEETS, ...oldExtras];
  const oldSale = [...linha("venda", "venda"), 0, 0, 0];
  const oldRent = [...linha("aluguel", "aluguel"), 1300, 390, 5690];
  const currentRows = [oldHeader, oldSale, oldRent];
  const newRent = [...linha("aluguel-novo"), 900, 200, 2300, 100];

  const rows = mesclarLinhasSheets([newRent], currentRows, "aluguel", newExtras);

  assert.deepEqual(rows.map(row => [row[0], row[20], row[21], row[22], row[23], row[24]]), [
    ["venda", "venda", 0, 0, 0, ""],
    ["aluguel-novo", "aluguel", 900, 200, 2300, 100],
  ]);
});

const root = new URL("../", import.meta.url);
const exportadores = fs.readdirSync(root, { withFileTypes: true })
  .filter(dir => dir.isDirectory() && !["niteroi", "uba"].includes(dir.name))
  .filter(dir => dir.name !== "rio")
  .filter(dir => fs.existsSync(new URL(`${dir.name}/sheets.js`, root)));

test("todos os 57 exportadores de JF usam a planilha principal e preservam a outra negociacao", async t => {
  const previous = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "planilha-antiga-vendas";
  t.after(() => {
    if (previous === undefined) delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    else process.env.GOOGLE_SHEETS_SPREADSHEET_ID = previous;
  });
  assert.equal(exportadores.length, 57);
  for (const dir of exportadores) {
    await t.test(dir.name, async () => {
      const { exportToSheets } = await import(new URL(`${dir.name}/sheets.js`, root));
      const sheet = planilha();
      const expectedHeader = dir.name === "universal"
        ? [...CABECALHO_IMOVEIS_SHEETS, "precoCondominio", "precoIptu", "precoTotal", "precoOutros"]
        : CABECALHO_IMOVEIS_SHEETS;
      const venda = { linkReal: "https://example.com/mesmo-imovel", preco: 500000 };
      const aluguel = { ...venda, preco: 1500 };
      await exportToSheets([venda], {}, sheet.api);
      const aba = sheet.calls.find(call => call[0] === "ensure")[2];
      assert.match(aba, /^jf/);
      assert.equal(sheet.calls[0][1], JF_SPREADSHEET_ID);
      await exportToSheets(new Map([["aluguel", aluguel]]), { negociacao: "aluguel" }, sheet.api);
      assert.deepEqual(sheet.rows()[0], expectedHeader);
      assert.deepEqual(sheet.rows().slice(1).map(row => [row[2], row[20]]), [[500000, "venda"], [1500, "aluguel"]]);
      await exportToSheets([{ ...venda, preco: 550000 }], {}, sheet.api);
      assert.deepEqual(sheet.rows().slice(1).map(row => [row[2], row[20]]), [[550000, "venda"], [1500, "aluguel"]]);
      await exportToSheets([], { negociacao: "aluguel" }, sheet.api);
      assert.deepEqual(sheet.rows().slice(1).map(row => [row[2], row[20]]), [[550000, "venda"]]);
      await exportToSheets([], {}, sheet.api);
      assert.deepEqual(sheet.rows(), [expectedHeader]);
      assert.ok(sheet.calls.filter(call => call[0] === "ensure").every(call => call[1] === JF_SPREADSHEET_ID && call[2] === aba));
    });
  }
});

test("respeita destino explicito para testes e outros usos", async () => {
  const { exportToSheets } = await import("../triade/sheets.js");
  const sheet = planilha();
  await exportToSheets([], { spreadsheetId: "teste", sheetName: "Aba teste" }, sheet.api);
  assert.deepEqual(sheet.calls[0], ["ensure", "teste", "Aba teste", 21]);
});

test("garante espaco para vendas e alugueis juntos antes de limpar a aba", async () => {
  const sheet = planilha();
  const novas = Array.from({ length: 1200 }, (_, index) => linha(`v${index}`));
  await exportarLinhasSheets(novas, { spreadsheetId: "teste", sheetName: "jfTeste" }, sheet.api);
  const resize = sheet.calls.findIndex(call => call[0] === "ensure" && call[4] === 1201);
  assert.ok(resize >= 0);
  assert.ok(resize < sheet.calls.findIndex(call => call[0] === "clear"));
  assert.equal(sheet.rows().length, 1201);
});
