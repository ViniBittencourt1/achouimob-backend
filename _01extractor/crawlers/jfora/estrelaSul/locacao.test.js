import assert from "node:assert/strict";
import fs from "node:fs";
import { mock, test } from "node:test";
import { JSDOM } from 'jsdom';
import { extractPreco } from "./extractor-03-preco.js";
import { loadCardsLocacaoEstrelaSul, readSnapshotEstrelaSulVendas } from "./extractor.js";

const html = '<div class="card-with-buttons__value-container"><p class="card-with-buttons__value-title">Venda</p><p class="card-with-buttons__value">R$ 19.000.000</p></div><div class="card-with-buttons__value-container"><p class="card-with-buttons__value-title">Aluguel</p><p class="card-with-buttons__value">R$ 1.200/m\u00eas</p></div>';
const calls = [];
let extracted = [{ linkReal: "https://www.estrelasulimoveis.com.br/imovel/teste/GA0037-ESU1?from=rent", preco: 1200 }];
let countError = null;
mock.module("../_utils/locacaoContagem.js", {
  namedExports: { contarAntesDaLocacaoKenlo: async (_browser, options) => {
    calls.push(["count", options]);
    if (countError) throw countError;
    return 1;
  } },
});
mock.module("node:fs", {
  defaultExport: { ...fs, existsSync: () => false, mkdirSync: (...args) => calls.push(["mkdir", ...args]), writeFileSync: (...args) => calls.push(["json", ...args]) },
});
mock.module("../../../services/puppeteerPool.js", {
  namedExports: { abrirBrowser: async () => ({ close: async () => calls.push(["close"]) }) },
});
mock.module("./extractor.js", {
  namedExports: { extractEstrelaSulData: async (_browser, links, options) => { calls.push(["extract", links, options]); return extracted; } },
});
mock.module("../../../services/googleSheets.js", {
  namedExports: {ensureSheet: async (_id, title) => title, readSheet: async () => [],  clearSheet: async (...args) => calls.push(["clear", ...args]), writeHeader: async (...args) => calls.push(["header", ...args]), writeSheet: async (...args) => calls.push(["rows", ...args]) },
});
const { main, destinoSheetsLocacao } = await import("./locacao.js");
const { exportToSheets } = await import("./sheets.js");

test('snapshot de venda conserva containers de preco e ignora botoes de carrossel', () => {
  const dom = new JSDOM(`<h1>Exibindo 1 Imóveis à venda</h1><a class="card-with-buttons borderHover" href="/imovel/1?from=sale">${html}</a><button class="btn-next" data-action="next">Proximo</button>`, { url: 'https://www.estrelasulimoveis.com.br/imoveis/a-venda' });
  const previous = globalThis.document;
  globalThis.document = dom.window.document;
  try {
    const snapshot = readSnapshotEstrelaSulVendas();
    assert.equal(snapshot.cards.length, 1);
    assert.equal(snapshot.next, '');
    assert.equal(extractPreco(snapshot.cards[0].html), 19000000);
    assert.equal(extractPreco(snapshot.cards[0].html, 'locacao'), 1200);
  } finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; dom.window.close(); }
});

test("card misto seleciona aluguel e preserva preco original de vendas", () => {
  assert.equal(extractPreco(html, "locacao"), 1200);
  assert.equal(extractPreco(html), 19000000);
  assert.equal(extractPreco(html.replace("R$ 1.200", "R$ 1.200,50"), "locacao"), 1200.5);
});

test("Sob consulta mantem null e nao usa venda como fallback", () => {
  assert.equal(extractPreco(html.replace("R$ 1.200/m\u00eas", "Sob consulta"), "locacao"), null);
  assert.equal(extractPreco(html.replace("Aluguel", "Venda"), "locacao"), null);
});

test("paginacao Ver mais carrega todos os 39 cards", async () => {
  let count = 12;
  let clicks = 0;
  const page = {
    evaluate: async () => 39,
    $$eval: async () => count,
    evaluateHandle: async () => ({ asElement: () => ({ click: async () => { count = Math.min(39, count + 12); clicks++; } }), dispose: async () => {} }),
    waitForFunction: async (_callback, _options, before) => assert.ok(count > before),
  };
  assert.equal(await loadCardsLocacaoEstrelaSul(page), 39);
  assert.equal(clicks, 3);
});

test("paginacao ausente nao publica coleta parcial", async () => {
  const page = { evaluate: async () => 39, $$eval: async () => 12, evaluateHandle: async () => ({ asElement: () => null, dispose: async () => {} }) };
  await assert.rejects(loadCardsLocacaoEstrelaSul(page), /Ver mais ausente/);
});

test("locacao usa JSON exclusivo e aba herdada jfEstrelaSul", async () => {
  await main();
  assert.deepEqual(calls.find(([name]) => name === "count")[1], { projeto: "jfEstrelaSul", url: "https://www.estrelasulimoveis.com.br/imoveis/para-alugar" });
  assert.ok(calls.findIndex(([name]) => name === "count") < calls.findIndex(([name]) => name === "extract"));
  assert.match(calls.find(([name]) => name === "json")[1], /jfEstrelaSulLocacao\.json$/);
  assert.deepEqual(calls.find(([name]) => name === "extract")[2], { negociacao: "locacao" });
  assert.deepEqual(calls.find(([name]) => name === "clear"), ["clear", destinoSheetsLocacao.spreadsheetId, "jfEstrelaSul"]);
  assert.equal(calls.find(([name]) => name === "header")[3].length, 21);
});

test("default do exportador continua com planilha de vendas", async () => {
  calls.length = 0;
  const previous = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY";
  try {
    await exportToSheets(extracted);
    assert.deepEqual(calls.find(([name]) => name === "clear"), ["clear", "1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY", "jfEstrelaSul"]);
  } finally {
    if (previous === undefined) delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    else process.env.GOOGLE_SHEETS_SPREADSHEET_ID = previous;
  }
});

test("falha da precontagem Estrela Sul impede extracao e preserva dados", async () => {
  calls.length = 0;
  countError = new Error("Contagem indisponivel");
  try {
    await assert.rejects(main(), /Contagem indisponivel/);
    assert.ok(calls.some(([name]) => name === "close"));
    assert.ok(!calls.some(([name]) => ["extract", "json", "clear", "rows"].includes(name)));
  } finally { countError = null; }
});

test("coleta vazia preserva JSON e planilha", async () => {
  calls.length = 0;
  extracted = [];
  await assert.rejects(main(), /Nenhum aluguel extraido/);
  assert.ok(!calls.some(([name]) => ["json", "clear", "rows"].includes(name)));
});