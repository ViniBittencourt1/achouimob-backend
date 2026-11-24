import assert from "node:assert/strict";
import fs from "node:fs";
import { mock, test } from "node:test";
import { load } from "cheerio";
import { JSDOM } from 'jsdom';
import { extractPreco } from "./extractor-03-preco.js";
import { scrapeListingPage, isRemaxLocacaoLink } from "./extractor-00-rotaExterna.js";

const calls = [];
let extracted = [{ linkReal: "https://www.remax.com.br/pt-br/imoveis/apartamento/alugar/juiz-de-fora/860281181-9", preco: 600, codigoBase: "860281181-9" }];
let countError = null;
mock.module("../_utils/locacaoContagem.js", {
  namedExports: { contarAntesDaLocacaoRemax: async (_browser, options) => {
    calls.push(["count", options]);
    if (countError) throw countError;
    return 1;
  } },
});
mock.module("node:fs", { defaultExport: { ...fs, existsSync: () => false, mkdirSync: (...args) => calls.push(["mkdir", ...args]), writeFileSync: (...args) => calls.push(["json", ...args]) } });
mock.module("../../../services/puppeteerPool.js", { namedExports: { abrirBrowser: async () => ({ close: async () => calls.push(["close"]) }) } });
mock.module("./extractor.js", { namedExports: { extractRemaxData: async (_browser, options) => { calls.push(["extract", options]); return { imoveisRaspados: extracted }; } } });
mock.module("../../../services/googleSheets.js", { namedExports: {ensureSheet: async (_id, title) => title, readSheet: async () => [],  clearSheet: async (...args) => calls.push(["clear", ...args]), writeHeader: async (...args) => calls.push(["header", ...args]), writeSheet: async (...args) => calls.push(["rows", ...args]) } });
const { main, destinoSheetsLocacao } = await import("./locacao.js");
const { exportToSheets } = await import("./sheets.js");

test("aluguel aceita centavos e padrao de vendas permanece original", () => {
  const document = load('<div class="listing-card"><div class="card-first-price">R$ 2.800,50</div></div>');
  assert.equal(extractPreco(document('.listing-card'), 'locacao'), 2800.5);
  assert.equal(extractPreco(document('.listing-card')), 280050);
});

test("preco mensal inteiro e Sob consulta", () => {
  const document = load('<div class="listing-card"><div class="card-first-price">R$ 600 Mensal</div></div>');
  assert.equal(extractPreco(document('.listing-card'), 'locacao'), 600);
  document('.card-first-price').text('Sob consulta');
  assert.equal(extractPreco(document('.listing-card'), 'locacao'), null);
});

test("RE/MAX usa alugar e locacao; venda e compra continuam rejeitadas", () => {
  assert.equal(isRemaxLocacaoLink('https://www.remax.com.br/pt-br/imoveis/outros/locacao/juiz-de-fora/860431023-118'), true);
  assert.equal(isRemaxLocacaoLink('https://www.remax.com.br/pt-br/imoveis/apartamento/alugar/juiz-de-fora/860281181-9'), true);
  assert.equal(isRemaxLocacaoLink('https://www.remax.com.br/pt-br/imoveis/apartamento/comprar/juiz-de-fora/860281181-9'), false);
  assert.equal(isRemaxLocacaoLink('https://www.remax.com.br/pt-br/imoveis/apartamento/venda/juiz-de-fora/860281181-9'), false);
});

test("locacao usa TransactionTypeUID260, JSON separado e aba herdada", async () => {
  await main();
  const url = new URL(calls.find(([name]) => name === "extract")[1].baseUrl);
  assert.deepEqual(calls.find(([name]) => name === "count")[1], { projeto: "jfRemax", url: url.href });
  assert.ok(calls.findIndex(([name]) => name === "count") < calls.findIndex(([name]) => name === "extract"));
  assert.equal(url.searchParams.get('TransactionTypeUID'), '260');
  assert.equal(url.searchParams.get('City'), '6579324');
  assert.equal(calls.find(([name]) => name === "extract")[1].totalEsperado, 1);
  assert.match(calls.find(([name]) => name === "json")[1], /jfRemaxLocacao\.json$/);
  assert.deepEqual(calls.find(([name]) => name === "clear"), ["clear", destinoSheetsLocacao.spreadsheetId, "jfRemax"]);
  assert.equal(calls.find(([name]) => name === "header")[3].length, 21);
});

test("exportador sem opcoes mantem planilha de vendas", async () => {
  calls.length = 0;
  const previous = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY";
  try { await exportToSheets(extracted); assert.deepEqual(calls.find(([name]) => name === "clear"), ["clear", "1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY", "jfRemax"]); }
  finally { if (previous === undefined) delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID; else process.env.GOOGLE_SHEETS_SPREADSHEET_ID = previous; }
});

test('exportacao formata atualizadoEm ISO, Date e Firestore no horario de Brasilia', async () => {
  calls.length = 0;
  const iso = '2026-10-07T13:42:14.421Z';
  const records = [iso, new Date(iso), { _seconds: Math.floor(Date.parse(iso) / 1000), _nanoseconds: 421000000 }].map(atualizadoEm => ({ atualizadoEm }));
  await exportToSheets(records, { spreadsheetId: 'planilha-alugueis', sheetName: 'jfRemax' });
  const rows = calls.find(([name]) => name === 'rows')[3];
  assert.deepEqual(rows.map(row => row[19]), Array(3).fill('07/10/2026 10:42:14'));
  assert.ok(rows.every(row => row.length === 21));
  assert.ok(rows.every(row => row[16] === '' && row[17] === ''));
});

test('exportacao conserva datas ja formatadas e valores ausentes', async () => {
  calls.length = 0;
  await exportToSheets([{ atualizadoEm: '06/10/2026 18:26:34' }, {}], { spreadsheetId: 'planilha-alugueis' });
  const rows = calls.find(([name]) => name === 'rows')[3];
  assert.equal(rows[0][19], '06/10/2026 18:26:34');
  assert.equal(rows[1][19], '');
});

test("falha da precontagem RE/MAX impede extracao e preserva dados", async () => {
  calls.length = 0;
  countError = new Error("Contagem indisponivel");
  try {
    await assert.rejects(main(), /Contagem indisponivel/);
    assert.ok(calls.some(([name]) => name === "close"));
    assert.ok(!calls.some(([name]) => ["extract", "json", "clear", "rows"].includes(name)));
  } finally { countError = null; }
});

test("coleta vazia nao altera JSON nem Sheets", async () => {
  calls.length = 0;
  extracted = [];
  await assert.rejects(main(), /Nenhum aluguel extraido/);
  assert.ok(!calls.some(([name]) => ["json", "clear", "rows"].includes(name)));
});

function fakeListingPage(total, pages = [[0], [1]]) {
  let index = 0;
  const link = page => `https://www.remax.com.br/pt-br/imoveis/apartamento/alugar/juiz-de-fora/860281181-${page + 9}`;
  const card = page => ({ evaluate: async () => ({
    linkReal: link(page), localizacao: "Rua Exemplo, Centro, Juiz de Fora, Minas Gerais", linkFoto: "https://cdn.gryphtech.com/userimages/foto.jpg",
    _outerHTML: `<div class="listing-card"><a href="${link(page)}"></a><div class="card-first-price">R$ 600</div></div>`,
  }) });
  return {
    waitForSelector: async () => {},
    evaluate: async (callback, html) => {
      if (html === undefined) return total;
      const dom = new JSDOM('', { url: 'https://www.remax.com.br/listings' });
      const previous = globalThis.document;
      globalThis.document = dom.window.document;
      try {
        const result = callback(html);
        result.localizacao = 'Rua Exemplo, Centro, Juiz de Fora, Minas Gerais';
        result.linkFoto = 'https://cdn.gryphtech.com/userimages/foto.jpg';
        return result;
      } finally {
        if (previous === undefined) delete globalThis.document;
        else globalThis.document = previous;
        dom.window.close();
      }
    },
    $$: async () => pages[index].map(card),
    $$eval: async (_selector, callback) => {
      const records = await Promise.all(pages[index].map(number => card(number).evaluate()));
      return callback(records.map(record => ({ outerHTML: record._outerHTML, querySelector: () => ({ href: record.linkReal }) })));
    },
    $: async () => index < pages.length - 1 ? { evaluate: async () => false, click: async () => { index++; } } : null,
    waitForFunction: async () => assert.ok(index > 0),
  };
}

test("paginacao de locacao segue total e remove HTML bruto", async () => {
  const timer = mock.method(globalThis, "setTimeout", callback => { queueMicrotask(callback); return 0; });
  try {
    const result = await scrapeListingPage(fakeListingPage(2), { negociacao: "locacao" });
    assert.equal(result.length, 2);
    assert.equal(result[0].preco, 600);
    assert.ok(result.every(item => !Object.hasOwn(item, "_outerHTML")));
    assert.ok(result.every(item => item.linkFoto.includes("cdn.gryphtech.com")));
  } finally { timer.mock.restore(); }
});

test("proxima pagina ausente antes do total aborta coleta parcial", async () => {
  const timer = mock.method(globalThis, "setTimeout", callback => { queueMicrotask(callback); return 0; });
  try { await assert.rejects(scrapeListingPage(fakeListingPage(3), { negociacao: "locacao" }), /Proxima pagina indisponivel/); }
  finally { timer.mock.restore(); }
});

test('ultima pagina com sobreposicao completa o total apenas com alugueis unicos', async () => {
  const timer = mock.method(globalThis, 'setTimeout', callback => { queueMicrotask(callback); return 0; });
  try {
    const result = await scrapeListingPage(fakeListingPage(3, [[0, 1], [1, 2]]), { negociacao: 'locacao' });
    assert.equal(result.length, 3);
    assert.equal(new Set(result.map(item => item.linkReal)).size, 3);
  } finally { timer.mock.restore(); }
});

test('pagina apenas repetida nao permite publicar coleta incompleta', async () => {
  const timer = mock.method(globalThis, 'setTimeout', callback => { queueMicrotask(callback); return 0; });
  try {
    await assert.rejects(scrapeListingPage(fakeListingPage(3, [[0, 1], [1, 0]]), { negociacao: 'locacao' }), /sem novos alugueis|duplicado/);
  } finally { timer.mock.restore(); }
});

test('sobreposicao nao permite aceitar total abaixo do anunciado', async () => {
  const timer = mock.method(globalThis, 'setTimeout', callback => { queueMicrotask(callback); return 0; });
  try {
    await assert.rejects(scrapeListingPage(fakeListingPage(4, [[0, 1], [1, 2]]), { negociacao: 'locacao' }), /Proxima pagina indisponivel/);
  } finally { timer.mock.restore(); }
});

test('vendas RE/MAX usam contagem unica completa e rejeitam precontagem diferente', async () => {
  const timer = mock.method(globalThis, 'setTimeout', callback => { queueMicrotask(callback); return 0; });
  try {
    const result = await scrapeListingPage(fakeListingPage(3, [[0, 1], [1, 2]]), { negociacao: 'venda', totalEsperado: 3 });
    assert.equal(result.length, 3);
    await assert.rejects(scrapeListingPage(fakeListingPage(3), { negociacao: 'venda', totalEsperado: 4 }), /Total RE\/MAX mudou/);
    await assert.rejects(scrapeListingPage(fakeListingPage(4, [[0, 1], [1, 2]]), { negociacao: 'venda', totalEsperado: 4 }), /Proxima pagina indisponivel/);
  } finally { timer.mock.restore(); }
});