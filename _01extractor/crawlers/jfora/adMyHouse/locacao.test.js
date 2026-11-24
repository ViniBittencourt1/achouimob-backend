import assert from "node:assert/strict";
import fs from "node:fs";
import { mock, test } from "node:test";

const calls = [];
let existeJson = false;
let existingData = [];
let result = { imoveisRaspados: [], novosImoveis: [], semImoveisConfirmado: true };
let countError = null;
mock.module("../_utils/locacaoContagem.js", {
  namedExports: { contarAntesDaLocacaoAcervo: async (_browser, options) => {
    calls.push(["count", options]);
    if (countError) throw countError;
    return result.imoveisRaspados.length || (result.semImoveisConfirmado ? 0 : 1);
  } },
});
mock.module("node:fs", {
  defaultExport: {
    ...fs,
    existsSync: file => String(file).endsWith('jfAdMyHouseLocacao.json') && existeJson,
    readFileSync: () => JSON.stringify(existingData),
    mkdirSync: (...args) => calls.push(["mkdir", ...args]),
    writeFileSync: (...args) => calls.push(["json", ...args]),
  },
});
mock.module("../../../services/puppeteerPool.js", {
  namedExports: { abrirBrowser: async options => {
    calls.push(["browser", options]);
    return { close: async () => calls.push(["close"]) };
  } },
});
mock.module("./extractor.js", {
  namedExports: { extractAdMyHouseData: async (_browser, codes, options) => {
    calls.push(["extract", codes, options]);
    return result;
  } },
});
mock.module("../../../services/googleSheets.js", {
  namedExports: {
    ensureSheet: async (_id, title) => title,
    readSheet: async () => [],
    appendRows: async (...args) => calls.push(['archive', ...args]),
    clearSheet: async (...args) => calls.push(["clear", ...args]),
    writeHeader: async (...args) => calls.push(["header", ...args]),
    writeSheet: async (...args) => calls.push(["rows", ...args]),
  },
});
const { main, destinoSheetsLocacao, outputPathLocacao } = await import("./locacao.js");
const { exportToSheets } = await import("./sheets.js");

test("primeira checagem vazia confirmada prepara JSON vazio e cabecalho da aba herdada", async () => {
  await main();
  assert.deepEqual(calls.find(([name]) => name === "browser")[1], { headlessOverride: true });
  assert.deepEqual(calls.find(([name]) => name === "count")[1], { projeto: "jfAdMyHouse", url: "https://www.admyhouse.com.br/imoveis/para-alugar/brasil?order=mais_relevantes" });
  assert.ok(calls.findIndex(([name]) => name === "count") < calls.findIndex(([name]) => name === "extract"));
  assert.match(outputPathLocacao, /crawler[/\\]jfAdMyHouseLocacao\.json$/);
  assert.equal(calls.find(([name]) => name === "json")[2], "[]");
  assert.deepEqual(calls.find(([name]) => name === "clear"), ["clear", destinoSheetsLocacao.spreadsheetId, "jfAdMyHouse"]);
  assert.equal(calls.find(([name]) => name === "header")[3].length, 21);
  assert.ok(!calls.some(([name]) => name === "rows"));
  assert.deepEqual(calls.find(([name]) => name === "extract")[2], {
    baseUrl: "https://www.admyhouse.com.br/imoveis/para-alugar/brasil?order=mais_relevantes", strict: true, totalEsperado: 0,
  });
});

test("falha na precontagem impede extracao e preserva dados da AdMyHouse", async () => {
  calls.length = 0;
  countError = new Error("Contagem indisponivel");
  try {
    await assert.rejects(main(), /Contagem indisponivel/);
    assert.ok(calls.some(([name]) => name === "close"));
    assert.ok(!calls.some(([name]) => ["extract", "json", "clear", "rows"].includes(name)));
  } finally { countError = null; }
});

test("checagem vazia arquiva historico existente e limpa os ativos", async () => {
  calls.length = 0;
  existeJson = true;
  existingData = [{ linkReal: "https://www.admyhouse.com.br/imovel/1", codigoBase: "1" }];
  await main();
  assert.ok(calls.some(([name]) => name === "close"));
  assert.ok(calls.some(([name]) => name === 'archive'));
  assert.ok(calls.some(([name]) => name === 'clear'));
});

test("JSON vazio existente permite repetir a preparacao do cabecalho", async () => {
  calls.length = 0;
  existeJson = true;
  existingData = [];
  await main();
  assert.equal(calls.find(([name]) => name === 'json')[2], '[]');
  assert.ok(calls.some(([name]) => name === "header"));
});

test("novos anuncios serao consolidados e enviados para jfAdMyHouse na planilha de alugueis", async () => {
  calls.length = 0;
  result = { imoveisRaspados: [{ linkReal: "https://www.admyhouse.com.br/imovel/1", codigoBase: "1", titulo: "Casa para locacao", preco: 1500 }], novosImoveis: [], semImoveisConfirmado: false };
  await main();
  const saved = JSON.parse(calls.find(([name]) => name === "json")[2]);
  assert.equal(saved[0].preco, 1500);
  assert.equal(saved[0].dataExclusao, "");
  assert.equal(calls.find(([name]) => name === "rows")[2], "'jfAdMyHouse'!A2:U2");
  assert.equal(calls.find(([name]) => name === "rows")[3][0][2], 1500);
});

test("coleta vazia sem confirmacao do site aborta sem sobrescrever dados", async () => {
  calls.length = 0;
  result = { imoveisRaspados: [], novosImoveis: [], semImoveisConfirmado: false };
  await assert.rejects(main(), /Coleta vazia nao confirmada/);
  assert.ok(!calls.some(([name]) => ["json", "clear", "rows"].includes(name)));
});

test("vendas mantem a planilha original e a mesma aba", async () => {
  calls.length = 0;
  const previous = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY";
  try {
    await exportToSheets([]);
    assert.deepEqual(calls.find(([name]) => name === "clear"), ["clear", "1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY", "jfAdMyHouse"]);
  } finally {
    if (previous === undefined) delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    else process.env.GOOGLE_SHEETS_SPREADSHEET_ID = previous;
  }
});
