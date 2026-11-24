import assert from "node:assert/strict";
import fs from "node:fs";
import { mock, test } from "node:test";
import { load } from "cheerio";
import { extractPreco } from "./extractor-03-preco.js";

const calls = [];
let extracted = [{ linkReal: "https://souzagomes.com.br/imovel/teste", titulo: "Apartamento", preco: 1500 }];
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
  namedExports: { extractSouzaGomesData: async (_browser, options) => {
    calls.push(["extract", options]);
    return { imoveisRaspados: extracted };
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
  },
});
const { main, destinoSheetsLocacao, outputPathLocacao } = await import("./locacao.js");
const { exportToSheets } = await import("./sheets.js");

test("card misto seleciona somente aluguel e conserva centavos", () => {
  const document = load('<div class="imovel-item"><div class="imovel-item--preco--item"><small>Venda</small><b>R$ 300.000,00</b></div><div class="imovel-item--preco--item"><small>Valor de loca\u00e7\u00e3o</small><b>R$ 1.500,90</b></div></div>');
  assert.equal(extractPreco(document('.imovel-item'), "locacao"), 1500.9);
});

test("default de vendas continua original e locacao nao usa venda como fallback", () => {
  const document = load('<div class="imovel-item"><div class="imovel-item--preco--item"><small>Venda</small><b>R$ 300.000,00</b></div></div>');
  assert.equal(extractPreco(document('.imovel-item')), 300000);
  assert.equal(extractPreco(document('.imovel-item'), "locacao"), null);
});

test("locacao usa URL informada, JSON separado e aba herdada jfSouzaGomes", async () => {
  await main();
  assert.equal(calls.find(([name]) => name === "count")[1].projeto, "jfSouzaGomes");
  assert.equal(calls.find(([name]) => name === "count")[1].url, calls.find(([name]) => name === "extract")[1].linksBusca[0]);
  assert.ok(calls.findIndex(([name]) => name === "count") < calls.findIndex(([name]) => name === "extract"));
  const options = calls.find(([name]) => name === "extract")[1];
  assert.equal(options.negociacao, "locacao");
  assert.equal(new URL(options.linksBusca[0]).searchParams.get("negociacao"), "locacao");
  assert.match(outputPathLocacao, /crawler[/\\]jfSouzaGomesLocacao\.json$/);
  assert.equal(JSON.parse(calls.find(([name]) => name === "json")[2])[0].preco, 1500);
  assert.deepEqual(calls.find(([name]) => name === "clear"), ["clear", destinoSheetsLocacao.spreadsheetId, "jfSouzaGomes"]);
  assert.equal(calls.find(([name]) => name === "header")[3].length, 21);
  assert.equal(calls.find(([name]) => name === "rows")[2], "'jfSouzaGomes'!A2:U2");
});

test("exportador mantem destino de vendas quando nao recebe opcoes", async () => {
  calls.length = 0;
  const previous = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY";
  try {
    await exportToSheets(extracted);
    assert.deepEqual(calls.find(([name]) => name === "clear"), ["clear", "1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY", "jfSouzaGomes"]);
  } finally {
    if (previous === undefined) delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    else process.env.GOOGLE_SHEETS_SPREADSHEET_ID = previous;
  }
});

test("falha da contagem impede extracao e preserva dados da Souza Gomes", async () => {
  calls.length = 0;
  countError = new Error("Contagem indisponivel");
  try {
    await assert.rejects(main(), /Contagem indisponivel/);
    assert.ok(calls.some(([name]) => name === "close"));
    assert.ok(!calls.some(([name]) => ["extract", "json", "clear", "rows"].includes(name)));
  } finally { countError = null; }
});

test("coleta vazia preserva dados e fecha o navegador", async () => {
  calls.length = 0;
  extracted = [];
  await assert.rejects(main(), /Nenhum aluguel extraido/);
  assert.ok(calls.some(([name]) => name === "close"));
  assert.ok(!calls.some(([name]) => ["json", "clear", "rows"].includes(name)));
});