import assert from "node:assert/strict";
import fs from "node:fs";
import { mock, test } from "node:test";
import { extractPreco } from "./extractor-03-preco.js";

const calls = [];
let extracted = [{ linkReal: "https://1000imoveisjf.com.br/imovel/teste", preco: 1500 }];
let countError = null;
mock.module("../_utils/locacaoContagem.js", {
  namedExports: { contarAntesDaLocacaoPadrao: async (_browser, options) => {
    calls.push(["count", options]);
    if (countError) throw countError;
    return 1;
  } },
});
mock.module("node:fs", {
  defaultExport: {
    ...fs,
    existsSync: () => false,
    mkdirSync: (...args) => calls.push(["mkdir", ...args]),
    writeFileSync: (...args) => calls.push(["json", ...args]),
  },
});
mock.module("../../../services/puppeteerPool.js", {
  namedExports: { abrirBrowser: async () => ({ close: async () => calls.push(["close"]) }) },
});
mock.module("./extractor.js", {
  namedExports: { extractMilImoveisData: async (_browser, links, options) => {
    calls.push(["extract", links, options]);
    return extracted;
  } },
});
mock.module("./extractor-00-rotaInterna.js", {
  namedExports: { enrichImoveisWithInternalData: async () => {} },
});
mock.module("../../../services/googleSheets.js", {
  namedExports: {ensureSheet: async (_id, title) => title, readSheet: async () => [],
    clearSheet: async (...args) => calls.push(["clear", ...args]),
    writeHeader: async (...args) => calls.push(["header", ...args]),
    writeSheet: async (...args) => calls.push(["rows", ...args]),
    setSheetNumberFormat: async (...args) => calls.push(["numberFormat", ...args]),
    getSheetTitleById: async (...args) => {
      calls.push(["gid", ...args]);
      return "Alugueis 1000 Imoveis";
    },
  },
});

const { main, outputPathLocacao, destinoSheetsLocacao } = await import("./locacao.js");
const { exportToSheets } = await import("./sheets.js");

test("locacao usa URL, JSON e planilha exclusivos, com a coluna adicional de negociacao", async () => {
  await main();
  assert.equal(calls.find(([name]) => name === "count")[1].projeto, "jf1000Imoveis");
  assert.equal(calls.find(([name]) => name === "count")[1].url, calls.find(([name]) => name === "extract")[1][0]);
  assert.ok(calls.findIndex(([name]) => name === "count") < calls.findIndex(([name]) => name === "extract"));
  const url = new URL(calls.find(([name]) => name === "extract")[1][0]);
  assert.equal(url.searchParams.get("negociacao"), "locacao");
  assert.equal(url.searchParams.get("preco_max"), "");
  assert.deepEqual(calls.find(([name]) => name === "extract")[2], { negociacao: "locacao", totalEsperado: 1 });
  assert.match(outputPathLocacao, /crawler[/\\]jf1000ImoveisLocacao\.json$/);
  assert.equal(calls.find(([name]) => name === "json")[1], outputPathLocacao);
  assert.equal(JSON.parse(calls.find(([name]) => name === "json")[2])[0].preco, extracted[0].preco);
  assert.equal(destinoSheetsLocacao.sheetName, "jf1000Imoveis");
  assert.ok(!calls.some(([name]) => name === "gid"));
  assert.equal(calls.find(([name]) => name === "header")[3].length, 21);
  assert.equal(calls.find(([name]) => name === "rows")[3][0][2], 1500);
  assert.deepEqual(calls.find(([name]) => name === "clear"), [
    "clear", destinoSheetsLocacao.spreadsheetId, "jf1000Imoveis",
  ]);
  assert.equal(calls.find(([name]) => name === "rows")[2], "'jf1000Imoveis'!A2:U2");
  assert.ok(calls.findIndex(([name]) => name === "close") < calls.findIndex(([name]) => name === "json"));
});

test("exportacao de vendas continua com a planilha e aba originais", async () => {
  calls.length = 0;
  const previous = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY";
  try {
    await exportToSheets(extracted);
    assert.deepEqual(calls.find(([name]) => name === "clear"), ["clear", "1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY", "jf1000Imoveis"]);
    assert.ok(!calls.some(([name]) => name === "gid"));
    assert.ok(!calls.some(([name]) => name === "numberFormat"));
  } finally {
    if (previous === undefined) delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    else process.env.GOOGLE_SHEETS_SPREADSHEET_ID = previous;
  }
});

test("raspagem vazia preserva JSON e planilha e fecha o navegador", async () => {
  calls.length = 0;
  extracted = [];
  await assert.rejects(main(), /Nenhum aluguel extraido/);
  assert.ok(calls.some(([name]) => name === "close"));
  assert.ok(!calls.some(([name]) => ["json", "clear", "header", "rows"].includes(name)));
});

test("falha da contagem impede extracao e preserva dados da 1000 Imoveis", async () => {
  calls.length = 0;
  countError = new Error("Contagem indisponivel");
  try {
    await assert.rejects(main(), /Contagem indisponivel/);
    assert.ok(calls.some(([name]) => name === "close"));
    assert.ok(!calls.some(([name]) => ["extract", "json", "clear", "rows"].includes(name)));
  } finally { countError = null; }
});

test("card com venda e locacao seleciona o aluguel sem alterar o preco padrao", () => {
  const html = `<div class="imovel-item--preco">
    <div class="imovel-item--preco--item"><small>Valor de venda</small><b>R$ 1.200.000,00</b></div>
    <div class="imovel-item--preco--item"><small>Valor de loca\u00e7\u00e3o</small><b>R$ 6.500,00</b></div>
  </div>`;
  assert.equal(extractPreco(html, "locacao"), 6500);
  assert.equal(extractPreco(html), 1200000);
});

test("locacao exclusiva aceita centavos e nao usa preco de venda como fallback", () => {
  const html = `<div class="imovel-item--preco">
    <div class="imovel-item--preco--item"><small>Valor de loca\u00e7\u00e3o</small><b>R$ 1.250,90</b></div>
  </div>`;
  assert.equal(extractPreco(html, "locacao"), 1250);
  assert.equal(extractPreco(html.replace("loca\u00e7\u00e3o", "venda"), "locacao"), null);
});