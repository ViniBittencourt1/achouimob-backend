import assert from "node:assert/strict";
import fs from "node:fs";
import { mock, test } from "node:test";
import { extractTitulo } from "./extractor-02-titulo.js";
import { extractPreco } from "./extractor-03-preco.js";

const titleHtml = '<span class="ImovelCardInfo_colorOfTitleCondominium__IfTu_">Apartamento no Centro</span>';
const feesHtml = '<div class="ImovelCardInfo_feesRow__ERQFy"><span class="ImovelCardInfo_feesValue__Ln2hX text-truncate">Condom\u00ednio R$&nbsp;168,50</span><span class="ImovelCardInfo_feesDivider___bG2D">\u00b7</span><span class="ImovelCardInfo_feesValue__Ln2hX text-truncate">IPTU R$&nbsp;87,22</span></div>';

const calls = [];
let extracted = [{
  linkReal: "https://www.acervoimoveis.com.br/imovel/loja/locacao/juiz-de-fora/mg/teixeiras/LO0181_ADIMVL",
  titulo: extractTitulo(titleHtml + feesHtml, { incluirTaxas: true }),
  preco: 950,
}];
let countError = null;
mock.module("../_utils/locacaoContagem.js", {
  namedExports: { contarAntesDaLocacaoAcervo: async (_browser, options) => {
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
  namedExports: { extractAcervoData: async (_browser, links, options) => {
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
  },
});
const { main, destinoSheetsLocacao, outputPathLocacao } = await import("./locacao.js");
const { exportToSheets } = await import("./sheets.js");

test("locacao acrescenta condominio e IPTU com espacos normais; vendas mantem titulo", () => {
  assert.equal(extractTitulo(titleHtml + feesHtml, { incluirTaxas: true }),
    "Apartamento no Centro | Condom\u00ednio R$ 168,50 / IPTU R$ 87,22");
  assert.equal(extractTitulo(titleHtml + feesHtml), "Apartamento no Centro");
});

test("titulo sem taxas nao ganha separador e taxa unica e preservada", () => {
  assert.equal(extractTitulo(titleHtml, { incluirTaxas: true }), "Apartamento no Centro");
  assert.equal(extractTitulo(titleHtml + '<span class="ImovelCardInfo_feesValue__abc"> IPTU R$&nbsp;87,22 </span>', { incluirTaxas: true }),
    "Apartamento no Centro | IPTU R$ 87,22");
});

test("aluguel seleciona preco de locacao sem taxas nem valor de venda", () => {
  const html = '<div class="d-flex flex-row justify-content-between text-truncate"><span>Venda</span><span>R$ 300.000,00</span></div>'
    + '<div class="d-flex flex-row justify-content-between text-truncate"><span>Aluguel</span><span>R$ 1.500,00</span></div>' + feesHtml;
  assert.equal(extractPreco(html, "locacao"), 1500);
  assert.equal(extractPreco(html), 300000);
  assert.equal(extractPreco(feesHtml, "locacao"), null);
});

test("layout atual usa priceValue separado das taxas", () => {
  const html = '<div class="ImovelCardInfo_priceRow__STnbH text-truncate"><span class="ImovelCardInfo_priceValue__9wQx4 text-truncate">R$&nbsp;950,00</span><span>Aluguel</span></div>' + feesHtml;
  assert.equal(extractPreco(html, "locacao"), 950);
});

test("locacao usa JSON exclusivo e aba jfAcervo na planilha de alugueis", async () => {
  await main();
  const extraction = calls.find(([name]) => name === "extract");
  assert.deepEqual(calls.find(([name]) => name === "count")[1], { projeto: "jfAcervo", url: extraction[1][0] });
  assert.ok(calls.findIndex(([name]) => name === "count") < calls.findIndex(([name]) => name === "extract"));
  assert.equal(extraction[1][0], "https://www.acervoimoveis.com.br/imoveis/para-alugar/brasil?order=mais_relevantes");
  assert.deepEqual(extraction[2], { negociacao: "locacao", incluirTaxas: true });
  assert.match(outputPathLocacao, /crawler[/\\]jfAcervoLocacao\.json$/);
  const saved = JSON.parse(calls.find(([name]) => name === "json")[2]);
  assert.equal(saved[0].preco, 950);
  assert.equal(saved[0].titulo, extracted[0].titulo);
  assert.deepEqual(calls.find(([name]) => name === "clear"), ["clear", destinoSheetsLocacao.spreadsheetId, "jfAcervo"]);
  assert.equal(calls.find(([name]) => name === "header")[3].length, 21);
  assert.equal(calls.find(([name]) => name === "rows")[2], "'jfAcervo'!A2:U2");
  assert.equal(calls.find(([name]) => name === "rows")[3][0][1], extracted[0].titulo);
  assert.ok(calls.findIndex(([name]) => name === "close") < calls.findIndex(([name]) => name === "json"));
});

test("vendas continua com planilha e aba originais", async () => {
  calls.length = 0;
  const previous = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY";
  try {
    await exportToSheets(extracted);
    assert.deepEqual(calls.find(([name]) => name === "clear"), ["clear", "1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY", "jfAcervo"]);
  } finally {
    if (previous === undefined) delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    else process.env.GOOGLE_SHEETS_SPREADSHEET_ID = previous;
  }
});

test("falha da precontagem Acervo impede extracao e preserva dados", async () => {
  calls.length = 0;
  countError = new Error("Contagem indisponivel");
  try {
    await assert.rejects(main(), /Contagem indisponivel/);
    assert.ok(calls.some(([name]) => name === "close"));
    assert.ok(!calls.some(([name]) => ["extract", "json", "clear", "rows"].includes(name)));
  } finally { countError = null; }
});

test("coleta vazia fecha navegador sem sobrescrever JSON nem planilha", async () => {
  calls.length = 0;
  extracted = [];
  await assert.rejects(main(), /Nenhum aluguel extraido/);
  assert.ok(calls.some(([name]) => name === "close"));
  assert.ok(!calls.some(([name]) => ["json", "clear", "rows"].includes(name)));
});