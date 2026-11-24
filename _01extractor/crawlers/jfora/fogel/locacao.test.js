import assert from "node:assert/strict";
import fs from "node:fs";
import { mock, test } from "node:test";
import { extractTitulo } from "./extractor-02-titulo.js";
import { enrichImoveisWithInternalData } from "./extractor-00-rotaInterna.js";

const html = '<p class="search-feat-card__cat-trans"><a><strong>Apartamento</strong></a></p><p class="search-feat-card__taxas">IPTU: R$ 96,23 / Condom\u00ednio: R$ 346,24 / Valor total: R$ 1.312,47</p>';
const calls = [];
let extracted = [{ linkReal: "https://fogel.com.br/detalhes/153711772.html", titulo: extractTitulo(html, { incluirTaxas: true }), preco: 870 }];
let countError = null;
mock.module("../_utils/locacaoContagem.js", {
  namedExports: { contarAntesDaLocacaoColibex: async (_browser, options) => {
    calls.push(["count", options]);
    if (countError) throw countError;
    return 1;
  } },
});
mock.module("node:fs", { defaultExport: { ...fs, existsSync: () => false, mkdirSync: (...args) => calls.push(["mkdir", ...args]), writeFileSync: (...args) => calls.push(["json", ...args]) } });
mock.module("../../../services/puppeteerPool.js", { namedExports: { abrirBrowser: async () => ({ close: async () => calls.push(["close"]) }) } });
mock.module("./extractor.js", { namedExports: { extractFogelData: async (_browser, _codes, options) => { calls.push(["extract", options]); return { imoveisRaspados: extracted }; } } });
mock.module("../../../services/googleSheets.js", { namedExports: {ensureSheet: async (_id, title) => title, readSheet: async () => [],  clearSheet: async (...args) => calls.push(["clear", ...args]), writeHeader: async (...args) => calls.push(["header", ...args]), writeSheet: async (...args) => calls.push(["rows", ...args]) } });
const { main, destinoSheetsLocacao } = await import("./locacao.js");
const { exportToSheets } = await import("./sheets.js");

test("taxas entram apenas no titulo de locacao", () => {
  assert.equal(extractTitulo(html), "Apartamento");
  assert.equal(extractTitulo(html, { incluirTaxas: true }), "Apartamento | IPTU: R$ 96,23 / Condom\u00ednio: R$ 346,24 / Valor total: R$ 1.312,47");
  assert.equal(extractTitulo('<img alt="Casa">', { incluirTaxas: true }), "Casa");
});

test("JSON e Sheets separados com aba jfFogel", async () => {
  await main();
  const options = calls.find(([name]) => name === "extract")[1];
  assert.deepEqual(calls.find(([name]) => name === "count")[1], { projeto: "jfFogel", url: options.baseUrl });
  assert.ok(calls.findIndex(([name]) => name === "count") < calls.findIndex(([name]) => name === "extract"));
  assert.equal(new URL(options.baseUrl).searchParams.get("transacao"), "Loca\u00e7\u00e3o");
  assert.equal(options.preservarPreco, true);
  assert.equal(options.incluirTaxas, true);
  assert.equal(options.strict, true);
  assert.match(calls.find(([name]) => name === "json")[1], /jfFogelLocacao\.json$/);
  assert.deepEqual(calls.find(([name]) => name === "clear"), ["clear", destinoSheetsLocacao.spreadsheetId, "jfFogel"]);
  assert.equal(calls.find(([name]) => name === "header")[3].length, 21);
});

test("default Sheets continua na planilha de vendas", async () => {
  calls.length = 0;
  const previous = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY";
  try { await exportToSheets(extracted); assert.deepEqual(calls.find(([name]) => name === "clear"), ["clear", "1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY", "jfFogel"]); }
  finally { if (previous === undefined) delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID; else process.env.GOOGLE_SHEETS_SPREADSHEET_ID = previous; }
});

test("detalhes nao substituem aluguel pelo total com taxas; vendas conserva comportamento", async () => {
  const timer = mock.method(globalThis, "setTimeout", callback => { queueMicrotask(callback); return 0; });
  const browser = { newPage: async () => ({ goto: async () => {}, evaluate: async () => ({ html: "", precoNumero: 1312 }), close: async () => {} }) };
  try {
    const aluguel = [{ linkReal: "teste", preco: 870 }];
    await enrichImoveisWithInternalData(browser, aluguel, { preservarPreco: true });
    assert.equal(aluguel[0].preco, 870);
    const venda = [{ linkReal: "teste", preco: 870 }];
    await enrichImoveisWithInternalData(browser, venda);
    assert.equal(venda[0].preco, 1312);
  } finally { timer.mock.restore(); }
});

test("falha da precontagem Fogel impede extracao e preserva dados", async () => {
  calls.length = 0;
  countError = new Error("Contagem indisponivel");
  try {
    await assert.rejects(main(), /Contagem indisponivel/);
    assert.ok(calls.some(([name]) => name === "close"));
    assert.ok(!calls.some(([name]) => ["extract", "json", "clear", "rows"].includes(name)));
  } finally { countError = null; }
});

test("coleta vazia nao altera os destinos anteriores", async () => {
  calls.length = 0;
  extracted = [];
  await assert.rejects(main(), /Nenhum aluguel extraido/);
  assert.ok(!calls.some(([name]) => ["json", "clear", "rows"].includes(name)));
});