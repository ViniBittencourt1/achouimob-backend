import assert from "node:assert/strict";
import fs from "node:fs";
import { mock, test } from "node:test";
import { extractTitulo } from "./extractor-02-titulo.js";
import { enrichImoveisWithInternalData } from "./extractor-00-rotaInterna.js";

const cardHtml = `<p class="search-feat-card__cat-trans"><a><strong>Apartamento para locacao</strong></a></p>
  <p class="search-feat-card__taxas">IPTU: R$ 35,00 / Condom\u00ednio: R$ 280,00 / Valor total: R$ 865,00</p>`;
const tituloComTaxas = "Apartamento para locacao | IPTU: R$ 35,00 / Condom\u00ednio: R$ 280,00 / Valor total: R$ 865,00";
const calls = [];
let extracted = [{ linkReal: "https://acasas.com.br/detalhes/teste", titulo: tituloComTaxas, preco: 550 }];
let countError = null;
mock.module("../_utils/locacaoContagem.js", {
  namedExports: { contarAntesDaLocacaoColibex: async (_browser, options) => {
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
  namedExports: { extractACasasData: async (_browser, _codes, options) => {
    calls.push(["extract", options]);
    return { imoveisRaspados: extracted, novosImoveis: extracted };
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
const { main, outputPathLocacao, destinoSheetsLocacao } = await import("./locacao.js");
const { exportToSheets } = await import("./sheets.js");

test("titulo de locacao inclui todas as taxas e vendas mantem titulo original", () => {
  assert.equal(extractTitulo(cardHtml, { incluirTaxas: true }), tituloComTaxas);
  assert.equal(extractTitulo(cardHtml), "Apartamento para locacao");
});

test("taxas sao opcionais e o texto HTML e normalizado", () => {
  assert.equal(extractTitulo('<img alt="Casa">', { incluirTaxas: true }), "Casa");
  const html = '<img alt="Casa"><p class="search-feat-card__taxas"> IPTU:&nbsp; <b>R$ 35,00</b>\n / Condom&iacute;nio: R$ 280,00 </p>';
  assert.equal(extractTitulo(html, { incluirTaxas: true }), "Casa | IPTU: R$ 35,00 / Condom\u00ednio: R$ 280,00");
});

test("locacao usa JSON exclusivo e aba herdada jfACasas na planilha de alugueis", async () => {
  await main();
  const options = calls.find(([name]) => name === "extract")[1];
  assert.deepEqual(calls.find(([name]) => name === "count")[1], { projeto: "jfACasas", url: options.baseUrl });
  assert.ok(calls.findIndex(([name]) => name === "count") < calls.findIndex(([name]) => name === "extract"));
  assert.equal(new URL(options.baseUrl).searchParams.get("transacao"), "Loca\u00e7\u00e3o");
  assert.equal(options.incluirTaxas, true);
  assert.equal(options.preservarPreco, true);
  assert.equal(options.strict, true);
  assert.match(outputPathLocacao, /crawler[/\\]jfACasasLocacao\.json$/);
  const saved = JSON.parse(calls.find(([name]) => name === "json")[2]);
  assert.equal(saved[0].titulo, tituloComTaxas);
  assert.deepEqual(calls.find(([name]) => name === "clear"), ["clear", destinoSheetsLocacao.spreadsheetId, "jfACasas"]);
  assert.equal(calls.find(([name]) => name === "rows")[2], "'jfACasas'!A2:U2");
  assert.equal(calls.find(([name]) => name === "rows")[3][0][1], tituloComTaxas);
  assert.equal(calls.find(([name]) => name === "header")[3].length, 21);
  assert.ok(calls.findIndex(([name]) => name === "close") < calls.findIndex(([name]) => name === "json"));
});

test("exportacao de vendas mantem planilha e aba originais", async () => {
  calls.length = 0;
  const previous = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY";
  try {
    await exportToSheets(extracted);
    assert.deepEqual(calls.find(([name]) => name === "clear"), ["clear", "1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY", "jfACasas"]);
  } finally {
    if (previous === undefined) delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    else process.env.GOOGLE_SHEETS_SPREADSHEET_ID = previous;
  }
});

test("falha da precontagem A Casas impede extracao e preserva dados", async () => {
  calls.length = 0;
  countError = new Error("Contagem indisponivel");
  try {
    await assert.rejects(main(), /Contagem indisponivel/);
    assert.ok(calls.some(([name]) => name === "close"));
    assert.ok(!calls.some(([name]) => ["extract", "json", "clear", "rows"].includes(name)));
  } finally { countError = null; }
});

test("raspagem vazia fecha navegador e preserva JSON e planilha", async () => {
  calls.length = 0;
  extracted = [];
  await assert.rejects(main(), /Nenhum aluguel extraido/);
  assert.ok(calls.some(([name]) => name === "close"));
  assert.ok(!calls.some(([name]) => ["json", "clear", "rows"].includes(name)));
});

test("detalhes nao trocam o aluguel pelo total com taxas; vendas mantem comportamento original", async () => {
  const timer = mock.method(globalThis, "setTimeout", (callback) => {
    queueMicrotask(callback);
    return 0;
  });
  const browser = {
    newPage: async () => ({
      goto: async () => {},
      evaluate: async () => ({ html: "", endereco: "", precoNumero: 865 }),
      close: async () => {},
    }),
  };
  try {
    const locacao = [{ linkReal: "https://acasas.com.br/detalhes/teste", preco: 550 }];
    await enrichImoveisWithInternalData(browser, locacao, { preservarPreco: true });
    assert.equal(locacao[0].preco, 550);
    const venda = [{ linkReal: "https://acasas.com.br/detalhes/teste", preco: 550 }];
    await enrichImoveisWithInternalData(browser, venda);
    assert.equal(venda[0].preco, 865);
  } finally {
    timer.mock.restore();
  }
});