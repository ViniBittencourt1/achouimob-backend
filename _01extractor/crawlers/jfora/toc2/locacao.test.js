import assert from "node:assert/strict";
import fs from "node:fs";
import { mock, test } from "node:test";
import { extractPreco } from "./extractor-03-preco.js";
import { buildUrlToc2Locacao, URL_LOCACAO_TOC2 } from "./extractor-locacao.js";
import { extractToc2Data } from "./extractor.js";

const html = '<div class="CardApartamentHorizontal_price_container__T0g40"><p class="CardApartamentHorizontal_price_label__EzIcf">Venda:</p><p class="CardApartamentHorizontal_price_value__ety2r">R$ 2.250.000,00</p></div><div class="CardApartamentHorizontal_price_container__T0g40"><p class="CardApartamentHorizontal_price_label__EzIcf">Aluguel:</p><p class="CardApartamentHorizontal_price_value__ety2r">R$ 10.000,50</p></div>';
const calls = [];
let extracted = [{ linkReal: "https://toc2imoveis.com.br/imoveis/venda/juiz-de-fora/estrela-sul/-/casa/367/imovel/3730348", preco: 10000, codigoBase: "367" }];
let countError = null;
mock.module("../_utils/locacaoContagem.js", {
  namedExports: { contarAntesDaLocacaoToc2: async (_browser, options) => {
    calls.push(["count", options]);
    if (countError) throw countError;
    return 1;
  } },
});
mock.module("node:fs", { defaultExport: { ...fs, existsSync: () => false, mkdirSync: (...args) => calls.push(["mkdir", ...args]), writeFileSync: (...args) => calls.push(["json", ...args]) } });
mock.module("../../../services/puppeteerPool.js", { namedExports: { abrirBrowser: async () => ({ close: async () => calls.push(["close"]) }) } });
mock.module("./extractor-locacao.js", { namedExports: { URL_LOCACAO_TOC2, extractToc2Locacao: async () => { calls.push(["extract"]); return extracted; } } });
mock.module("./extractor-00-rotaInterna.js", { namedExports: { enrichImoveisWithInternalData: async () => {} } });
mock.module("../../../services/googleSheets.js", { namedExports: {ensureSheet: async (_id, title) => title, readSheet: async () => [],  clearSheet: async (...args) => calls.push(["clear", ...args]), writeHeader: async (...args) => calls.push(["header", ...args]), writeSheet: async (...args) => calls.push(["rows", ...args]) } });
const { main, destinoSheetsLocacao } = await import("./locacao.js");
const { exportToSheets } = await import("./sheets.js");

test("card misto seleciona aluguel e conserva venda original", () => {
  assert.equal(extractPreco(html, 'locacao'), 10000.5);
  assert.equal(extractPreco(html), 2250000);
  assert.throws(() => extractPreco(html.replace('Aluguel:', 'Venda:'), 'locacao'), /aluguel TOC2 nao encontrado/);
});

test("card de rota exclusiva de aluguel aceita preco sem rotulo", () => {
  const rentalOnly = '<article><span>Aluguel</span><div class="CardApartamentHorizontal_price_container__nova"><p class="CardApartamentHorizontal_price_value__nova">R$ 1.250,00</p></div></article>';
  assert.equal(extractPreco(rentalOnly, 'locacao'), 1250);
});

test("paginas conservam aluguel e ordem sem faixa de preco de venda", () => {
  const url = new URL(buildUrlToc2Locacao(2));
  assert.equal(url.pathname, '/imoveis/aluguel/-/-/-/-');
  assert.equal(url.searchParams.get('ordem'), 'desc-inclusao');
  assert.equal(url.searchParams.get('pagination'), '2');
  assert.equal(url.searchParams.has('max'), false);
});

test("modo locacao extrai codigo do badge do card sem alterar o leitor de vendas", () => {
  const card = '<div class="ListPiecesProperties_card_horizontal1__novo"><a href="/imoveis/aluguel/juiz-de-fora/centro/-/apartamento/387/imovel/3789629"></a><div class="CardApartamentHorizontal_codigo_badge__novo"><span>C\u00f3digo: 387</span></div>' + html + '</div>';
  assert.equal(extractToc2Data(card, new Set(), { negociacao: 'locacao' }).imoveisRaspados[0].codigoBase, '387');
});

test("destinos separados com aba jfToc2 e anuncios mistos permitidos", async () => {
  await main();
  assert.deepEqual(calls.find(([name]) => name === "count")[1], { projeto: "jfToc2", url: URL_LOCACAO_TOC2 });
  assert.ok(calls.findIndex(([name]) => name === "count") < calls.findIndex(([name]) => name === "extract"));
  assert.match(calls.find(([name]) => name === "json")[1], /jfToc2Locacao\.json$/);
  assert.deepEqual(calls.find(([name]) => name === "clear"), ["clear", destinoSheetsLocacao.spreadsheetId, "jfToc2"]);
  assert.equal(calls.find(([name]) => name === "header")[3].length, 21);
});

test("default do Sheets permanece vendas", async () => {
  calls.length = 0;
  const previous = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY";
  try { await exportToSheets(extracted); assert.deepEqual(calls.find(([name]) => name === "clear"), ["clear", "1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY", "jfToc2"]); }
  finally { if (previous === undefined) delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID; else process.env.GOOGLE_SHEETS_SPREADSHEET_ID = previous; }
});

test("falha da precontagem TOC2 impede extracao e preserva dados", async () => {
  calls.length = 0;
  countError = new Error("Contagem indisponivel");
  try {
    await assert.rejects(main(), /Contagem indisponivel/);
    assert.ok(calls.some(([name]) => name === "close"));
    assert.ok(!calls.some(([name]) => ["extract", "json", "clear", "rows"].includes(name)));
  } finally { countError = null; }
});

test("coleta vazia preserva dados", async () => {
  calls.length = 0;
  extracted = [];
  await assert.rejects(main(), /Nenhum aluguel extraido/);
  assert.ok(!calls.some(([name]) => ["json", "clear", "rows"].includes(name)));
});