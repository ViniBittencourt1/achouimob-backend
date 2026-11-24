import assert from "node:assert/strict";
import fs from "node:fs";
import { mock, test } from "node:test";
import { extractPreco } from "./extractor-03-preco.js";
import { buildUrlSoaresLocacao, validateSoaresLocacaoPage, URL_LOCACAO_SOARES } from "./extractor-locacao.js";

const html = '<li><span class="descricao-transacao">Venda</span><strong class="valor-transacao">R$ 380.000,00</strong></li><li><span class="descricao-transacao">Aluguel</span><strong class="valor-transacao">R$ 1.500,50</strong></li><li><span class="descricao-transacao">Condom\u00ednio</span><strong class="valor-transacao">R$ 300,00</strong></li>';
const calls = [];
let extracted = [{ linkReal: "https://www.secimoveis.com.br/imovel/casa/REFV00128", preco: 1500, codigoBase: "REFV00128" }];
let countError = null;
mock.module("../_utils/locacaoContagem.js", {
  namedExports: { contarAntesDaLocacaoSoares: async (_browser, options) => {
    calls.push(["count", options]);
    if (countError) throw countError;
    return 1;
  } },
});
mock.module("node:fs", { defaultExport: { ...fs, existsSync: () => false, mkdirSync: (...args) => calls.push(["mkdir", ...args]), writeFileSync: (...args) => calls.push(["json", ...args]) } });
mock.module("../../../services/puppeteerPool.js", { namedExports: { abrirBrowser: async () => ({ close: async () => calls.push(["close"]) }) } });
mock.module("./extractor-locacao.js", { namedExports: { URL_LOCACAO_SOARES, extractSoaresLocacao: async () => { calls.push(["extract"]); return extracted; } } });
mock.module("../../../services/googleSheets.js", { namedExports: {ensureSheet: async (_id, title) => title, readSheet: async () => [],  clearSheet: async (...args) => calls.push(["clear", ...args]), writeHeader: async (...args) => calls.push(["header", ...args]), writeSheet: async (...args) => calls.push(["rows", ...args]) } });
const { main, destinoSheetsLocacao } = await import("./locacao.js");
const { exportToSheets } = await import("./sheets.js");

test("card misto seleciona Aluguel, sem Venda ou Condominio", () => {
  assert.equal(extractPreco(html, 'locacao'), 1500.5);
  assert.equal(extractPreco(html), 380000);
  assert.throws(() => extractPreco(html.replace('Aluguel', 'Venda'), 'locacao'), /Aluguel nao encontrado/);
});

test("paginas mantem rota aluguel e filtro AA no hash", () => {
  const url = new URL(buildUrlSoaresLocacao(2));
  const params = new URLSearchParams(url.hash.slice(3));
  assert.equal(url.pathname, '/imoveis/aluguel');
  assert.equal(params.get('tipoNegocio'), 'AA');
  assert.equal(params.get('page'), '2');
  assert.equal(validateSoaresLocacaoPage(url.href, '4 Im\u00f3veis para Alugar'), 4);
});

test("redirecionamento para vendas e rejeitado", () => {
  assert.throws(() => validateSoaresLocacaoPage(buildUrlSoaresLocacao(1).replace('/aluguel', '/venda'), '372 Im\u00f3veis \u00e0 Venda'), /fora da locacao/);
  assert.throws(() => validateSoaresLocacaoPage(buildUrlSoaresLocacao(1).replace('tipoNegocio=AA', 'tipoNegocio=VA,VL'), '4 Im\u00f3veis para Alugar'), /fora da locacao/);
});

test("rota canonica sem barra ou hash continua exigindo titulo de aluguel", () => {
  for (const url of [
    "https://www.secimoveis.com.br/imoveis/aluguel",
    "https://www.secimoveis.com.br/imoveis/aluguel/",
    "https://www.secimoveis.com.br/imoveis/aluguel//#/?tipoNegocio=AA",
  ]) {
    assert.equal(validateSoaresLocacaoPage(url, "4 Imoveis para Alugar"), 4);
    assert.throws(() => validateSoaresLocacaoPage(url, "372 Imoveis a Venda"), /nao identificado/);
  }
  assert.throws(() => validateSoaresLocacaoPage("https://outro.example/imoveis/aluguel", "4 Imoveis para Alugar"), /fora da locacao/);
});

test("JSON exclusivo e aba herdada jfSoares", async () => {
  await main();
  assert.deepEqual(calls.find(([name]) => name === "count")[1], { projeto: "jfSoares", url: URL_LOCACAO_SOARES });
  assert.ok(calls.findIndex(([name]) => name === "count") < calls.findIndex(([name]) => name === "extract"));
  assert.match(calls.find(([name]) => name === "json")[1], /jfSoaresLocacao\.json$/);
  assert.deepEqual(calls.find(([name]) => name === "clear"), ["clear", destinoSheetsLocacao.spreadsheetId, "jfSoares"]);
  assert.equal(calls.find(([name]) => name === "header")[3].length, 21);
});

test("Sheets padrao continua vendas", async () => {
  calls.length = 0;
  const previous = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY";
  try { await exportToSheets(extracted); assert.deepEqual(calls.find(([name]) => name === "clear"), ["clear", "1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY", "jfSoares"]); }
  finally { if (previous === undefined) delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID; else process.env.GOOGLE_SHEETS_SPREADSHEET_ID = previous; }
});

test("falha da precontagem Soares impede extracao e preserva dados", async () => {
  calls.length = 0;
  countError = new Error("Contagem indisponivel");
  try {
    await assert.rejects(main(), /Contagem indisponivel/);
    assert.ok(calls.some(([name]) => name === "close"));
    assert.ok(!calls.some(([name]) => ["extract", "json", "clear", "rows"].includes(name)));
  } finally { countError = null; }
});

test("coleta vazia preserva destinos", async () => {
  calls.length = 0;
  extracted = [];
  await assert.rejects(main(), /Nenhum aluguel extraido/);
  assert.ok(!calls.some(([name]) => ["json", "clear", "rows"].includes(name)));
});