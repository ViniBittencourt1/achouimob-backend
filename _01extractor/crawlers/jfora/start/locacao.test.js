import assert from "node:assert/strict";
import fs from "node:fs";
import { mock, test } from "node:test";
import { enrichImoveisWithInternalData } from "./extractor-00-rotaInterna.js";
import { extractStartData } from "./extractor.js";

const calls = [];
let extracted = [{ linkReal: "https://www.startimoveisjf.com.br/imovel/178467/galpao_para-alugar_juiz-de-fora-mg_vila-ideal", preco: 1300 }];
let countError = null;
mock.module("../_utils/locacaoContagem.js", {
  namedExports: { contarAntesDaLocacaoStart: async (_browser, options) => {
    calls.push(["count", options]);
    if (countError) throw countError;
    return 1;
  } },
});
mock.module("node:fs", { defaultExport: { ...fs, existsSync: () => false, mkdirSync: (...args) => calls.push(["mkdir", ...args]), writeFileSync: (...args) => calls.push(["json", ...args]) } });
mock.module("../../../services/puppeteerPool.js", { namedExports: { abrirBrowser: async () => ({ close: async () => calls.push(["close"]) }) } });
mock.module("./extractor.js", { namedExports: { extractStartData: async (_browser, _codes, options) => { calls.push(["extract", options]); return { imoveisRaspados: extracted }; } } });
mock.module("../../../services/googleSheets.js", { namedExports: {ensureSheet: async (_id, title) => title, readSheet: async () => [],  clearSheet: async (...args) => calls.push(["clear", ...args]), writeHeader: async (...args) => calls.push(["header", ...args]), writeSheet: async (...args) => calls.push(["rows", ...args]) } });
const { main, destinoSheetsLocacao } = await import("./locacao.js");
const { exportToSheets } = await import("./sheets.js");

test("locacao usa negocio2, JSON separado e aba jfStart", async () => {
  await main();
  const options = calls.find(([name]) => name === "extract")[1];
  assert.deepEqual(calls.find(([name]) => name === "count")[1], { projeto: "jfStart", url: options.baseUrl });
  assert.ok(calls.findIndex(([name]) => name === "count") < calls.findIndex(([name]) => name === "extract"));
  assert.equal(new URL(options.baseUrl).searchParams.get('negocio'), '2');
  assert.equal(options.strict, true);
  assert.equal(options.preservarPreco, true);
  assert.equal(options.totalEsperado, 1);
  assert.match(calls.find(([name]) => name === "json")[1], /jfStartLocacao\.json$/);
  assert.deepEqual(calls.find(([name]) => name === "clear"), ["clear", destinoSheetsLocacao.spreadsheetId, "jfStart"]);
  assert.equal(calls.find(([name]) => name === "header")[3].length, 21);
});

test("detalhes preservam aluguel e mantem comportamento original de vendas", async () => {
  const timer = mock.method(globalThis, "setTimeout", callback => { queueMicrotask(callback); return 0; });
  const browser = { newPage: async () => ({ goto: async () => {}, evaluate: async () => ({ html: '', precoNumero: 300000 }), close: async () => {} }) };
  try {
    const rental = [{ linkReal: 'teste', preco: 1300 }];
    await enrichImoveisWithInternalData(browser, rental, { preservarPreco: true });
    assert.equal(rental[0].preco, 1300);
    const sale = [{ linkReal: 'teste', preco: 1300 }];
    await enrichImoveisWithInternalData(browser, sale);
    assert.equal(sale[0].preco, 300000);
  } finally { timer.mock.restore(); }
});

test("default Sheets permanece vendas", async () => {
  calls.length = 0;
  const previous = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY";
  try { await exportToSheets(extracted); assert.deepEqual(calls.find(([name]) => name === "clear"), ["clear", "1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY", "jfStart"]); }
  finally { if (previous === undefined) delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID; else process.env.GOOGLE_SHEETS_SPREADSHEET_ID = previous; }
});

test("falha da precontagem Start impede extracao e preserva dados", async () => {
  calls.length = 0;
  countError = new Error("Contagem indisponivel");
  try {
    await assert.rejects(main(), /Contagem indisponivel/);
    assert.ok(calls.some(([name]) => name === "close"));
    assert.ok(!calls.some(([name]) => ["extract", "json", "clear", "rows"].includes(name)));
  } finally { countError = null; }
});

test("coleta vazia nao sobrescreve destinos", async () => {
  calls.length = 0;
  extracted = [];
  await assert.rejects(main(), /Nenhum aluguel extraido/);
  assert.ok(!calls.some(([name]) => ["json", "clear", "rows"].includes(name)));
});

test("modo estrito rejeita filtro de venda antes de abrir pagina", async () => {
  await assert.rejects(extractStartData({}, new Set(), { baseUrl: 'https://www.startimoveisjf.com.br/imoveis.php?negocio=1', strict: true }), /Filtro de aluguel/);
});