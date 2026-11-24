import assert from "node:assert/strict";
import fs from "node:fs";
import { mock, test } from "node:test";
import { extractPrecoLocacao } from "./locacaoPadraoPreco.js";
import { extractPreco } from "../alicerce/extractor-03-preco.js";
import { extractRezendeData } from "../rezende/extractor.js";
import { projetosLocacaoPadrao, buildUrlLocacao, getProjetoLocacao } from "./locacaoPadraoProjetos.js";
import { parseTotalLocacaoPadrao } from './locacaoContagem.js';

export const cardMisto = '<div class="imovel-item--preco"><div class="imovel-item--preco--item"><small>Valor de venda</small><b>R$ 300.000,00</b></div><div class="imovel-item--preco--item"><small>Valor de loca\u00e7\u00e3o</small><b>R$ 1.500,90</b></div></div>';

const calls = [];
let extracted = [{ linkReal: "https://alicerceimob.com.br/imovel/teste", preco: 1500 }];
let rezendeEmptyConfirmed = true;
let countError = null;
mock.module("./locacaoContagem.js", {
  namedExports: { parseTotalLocacaoPadrao, contarAntesDaLocacaoPadrao: async (_browser, options) => {
    calls.push(["count", options]);
    if (countError) throw countError;
    return options.projeto === 'jfRezende' && rezendeEmptyConfirmed ? 0 : 1;
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
mock.module("../alicerce/extractor.js", {
  namedExports: { extractAlicerceData: async (_browser, links, options) => {
    calls.push(["extract", links, options]);
    return extracted;
  } },
});
mock.module("../alicerce/extractor-00-rotaInterna.js", {
  namedExports: { enrichImoveisWithInternalData: async () => {} },
});
mock.module("../ribeiroArrabal/extractor.js", {
  namedExports: { extractRibeiroArrabalData: async (_browser, links, options) => {
    calls.push(["extractRibeiro", links, options]);
    return [{ linkReal: "https://ribeiroearrabal.com.br/imovel/teste", preco: 1500 }];
  } },
});
mock.module("../ribeiroArrabal/extractor-00-rotaInterna.js", {
  namedExports: { enrichImoveisWithInternalData: async () => calls.push(["enrichRibeiro"]) },
});
mock.module("../rezende/extractor.js", {
  namedExports: { extractRezendeData: async (_browser, _links, options) => {
    if (rezendeEmptyConfirmed) options.onEmptyConfirmed();
    return [];
  } },
});
mock.module("../../../services/googleSheets.js", {
  namedExports: {ensureSheet: async (_id, title) => title, readSheet: async () => [],
    clearSheet: async (...args) => calls.push(["clear", ...args]),
    writeHeader: async (...args) => calls.push(["header", ...args]),
    writeSheet: async (...args) => calls.push(["rows", ...args]),
  },
});
const { loadProjetoLocacao, runProjetoLocacao, validateImoveisLocacao, SPREADSHEET_LOCACAO } = await import("./locacaoPadrao.js");

test("padrao seleciona aluguel pelo rotulo em cards mistos", () => {
  assert.equal(extractPrecoLocacao(cardMisto), 1500);
  assert.equal(extractPrecoLocacao(cardMisto.replace("loca\u00e7\u00e3o", "venda")), null);
});

test("Alicerce preserva extracao de vendas e aceita modo locacao", () => {
  assert.equal(extractPreco(cardMisto), 300000);
  assert.equal(extractPreco(cardMisto, "locacao"), 1500);
});

for (const projeto of projetosLocacaoPadrao) {
  test(`${projeto.collection}: preco de aluguel e default de vendas`, async () => {
    const price = await import(`../${projeto.folder}/extractor-03-preco.js`);
    assert.equal(price.extractPreco(cardMisto), 300000);
    assert.equal(price.extractPreco(cardMisto, "locacao"), 1500);
  });
  test(`${projeto.collection}: URL de locacao sem filtros de preco de venda`, () => {
    const original = new URL(projeto.urlVenda);
    const rental = new URL(buildUrlLocacao(projeto.urlVenda));
    assert.equal(rental.origin, original.origin);
    assert.equal(rental.pathname, original.pathname);
    assert.equal(rental.searchParams.get("negociacao"), "locacao");
    assert.equal(rental.searchParams.get("preco_min"), "");
    assert.equal(rental.searchParams.get("preco_max"), "");
    assert.equal(rental.searchParams.get("order"), original.searchParams.get("order"));
    for (const [key, value] of original.searchParams) {
      if (!["negociacao", "preco_min", "preco_max"].includes(key)) {
        assert.equal(rental.searchParams.get(key), value);
      }
    }
    assert.equal(getProjetoLocacao(projeto.collection), projeto);
  });
  test(`${projeto.collection}: modulos e Sheets unificados com negociacao`, async () => {
    const functions = await loadProjetoLocacao(projeto);
    const consolidated = functions.consolidate([{ linkReal: "teste", preco: 1500 }], new Map());
    assert.ok(consolidated instanceof Map);
    assert.equal(consolidated.get("teste").preco, 1500);
    calls.length = 0;
    const previous = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY";
    try {
      await functions.exportToSheets([{ linkReal: "teste", preco: 1500 }]);
      assert.deepEqual(calls.find(([name]) => name === "clear"), ["clear", "1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY", projeto.collection]);
      calls.length = 0;
      await functions.exportToSheets([{ linkReal: "teste", preco: 1500 }], {
        spreadsheetId: SPREADSHEET_LOCACAO, sheetName: projeto.collection,
      });
      assert.deepEqual(calls.find(([name]) => name === "clear"), ["clear", SPREADSHEET_LOCACAO, projeto.collection]);
      assert.equal(calls.find(([name]) => name === "header")[3].length, projeto.collection === "jfUniversal" ? 25 : 21);
      assert.equal(calls.find(([name]) => name === "rows")[3][0][2], 1500);
    } finally {
      if (previous === undefined) delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
      else process.env.GOOGLE_SHEETS_SPREADSHEET_ID = previous;
    }
  });
}

test("layouts diferentes nao entram automaticamente no lote", () => {
  assert.throws(() => getProjetoLocacao("jfAcervo"), /fora do padrao/);
  assert.throws(() => getProjetoLocacao("jfToronto"), /fora do padrao/);
  assert.throws(() => getProjetoLocacao("jfBomClima"), /fora do padrao/);
});

test("executor salva JSON exclusivo e usa negociacao locacao com aba herdada", async () => {
  calls.length = 0;
  await runProjetoLocacao("alicerce");
  assert.deepEqual(calls.find(([name]) => name === "count")[1], { projeto: "jfAlicerce", url: buildUrlLocacao(getProjetoLocacao("alicerce").urlVenda), allowConfirmedEmpty: undefined });
  assert.ok(calls.findIndex(([name]) => name === "count") < calls.findIndex(([name]) => name === "extract"));
  assert.deepEqual(calls.find(([name]) => name === "extract")[2], { negociacao: "locacao" });
  assert.match(calls.find(([name]) => name === "json")[1], /crawler[/\\]jfAlicerceLocacao\.json$/);
  assert.deepEqual(calls.find(([name]) => name === "clear"), ["clear", SPREADSHEET_LOCACAO, "jfAlicerce"]);
  assert.ok(calls.findIndex(([name]) => name === "close") < calls.findIndex(([name]) => name === "json"));
});

test("falha de precontagem impede extracao e preserva os dados do lote", async () => {
  calls.length = 0;
  countError = new Error("Contagem indisponivel");
  try {
    await assert.rejects(runProjetoLocacao("alicerce"), /Contagem indisponivel/);
    assert.ok(calls.some(([name]) => name === "close"));
    assert.ok(!calls.some(([name]) => ["extract", "json", "clear", "rows"].includes(name)));
  } finally { countError = null; }
});

test("Ribeiro recebe total da precontagem na coleta de aluguel antes dos detalhes", async () => {
  calls.length = 0;
  await runProjetoLocacao("ribeiroArrabal");
  assert.deepEqual(calls.find(([name]) => name === "extractRibeiro")[2], { negociacao: "locacao", totalEsperado: 1 });
  assert.ok(calls.findIndex(([name]) => name === "count") < calls.findIndex(([name]) => name === "extractRibeiro"));
  assert.ok(calls.findIndex(([name]) => name === "extractRibeiro") < calls.findIndex(([name]) => name === "enrichRibeiro"));
});

test("coleta vazia ou preco invalido nao sobrescreve JSON e planilha", async () => {
  calls.length = 0;
  extracted = [];
  await assert.rejects(runProjetoLocacao("alicerce"), /Nenhum aluguel extraido/);
  assert.ok(calls.some(([name]) => name === "close"));
  assert.ok(!calls.some(([name]) => ["json", "clear", "rows"].includes(name)));
  assert.throws(() => validateImoveisLocacao([{ linkReal: "teste", preco: "invalido" }]), /preco valido/);
  assert.throws(() => validateImoveisLocacao([{ preco: 1500 }]), /preco valido/);
});

test("Aceita proposta preserva aluguel com preco null sem usar valor de venda", () => {
  const html = cardMisto.replace("R$ 1.500,90", "Aceita proposta.");
  const preco = extractPrecoLocacao(html);
  assert.equal(preco, null);
  assert.deepEqual(validateImoveisLocacao([{ linkReal: "teste", preco }]), [{ linkReal: "teste", preco: null }]);
});

test("Rezende vazia confirmada zera JSON e Sheets sem gravar registros", async () => {
  calls.length = 0;
  await runProjetoLocacao("rezende");
  assert.equal(calls.find(([name]) => name === "count")[1].allowConfirmedEmpty, true);
  assert.match(calls.find(([name]) => name === "json")[1], /jfRezendeLocacao\.json$/);
  assert.equal(calls.find(([name]) => name === "json")[2], "[]");
  assert.deepEqual(calls.find(([name]) => name === "clear"), ["clear", SPREADSHEET_LOCACAO, "jfRezende"]);
  assert.equal(calls.find(([name]) => name === "header")[3].length, 21);
  assert.ok(!calls.some(([name]) => name === "rows"));
});

test("Rezende sem confirmacao de vazio preserva destinos anteriores", async () => {
  calls.length = 0;
  rezendeEmptyConfirmed = false;
  await assert.rejects(runProjetoLocacao("rezende"), /Nenhum aluguel extraido/);
  assert.ok(!calls.some(([name]) => ["json", "clear", "header", "rows"].includes(name)));
});

test("extrator Rezende so confirma vazio em locacao, com aviso e resposta valida", async () => {
  const previousDocument = globalThis.document;
  let ok = true;
  const page = {
    setUserAgent: async () => {},
    setViewport: async () => {},
    goto: async () => ({ ok: () => ok }),
    waitForSelector: async () => { throw new Error("Sem aviso LGPD"); },
    $$eval: async () => 0,
    $: async () => null,
    $$: async () => [],
    evaluate: async callback => callback(),
    close: async () => {},
  };
  let confirmations = 0;
  const browser = { newPage: async () => page };
  const links = [buildUrlLocacao(getProjetoLocacao("rezende").urlVenda)];
  try {
    globalThis.document = { body: { innerText: "O filtro n\u00e3o retornou nenhum im\u00f3vel!" } };
    const options = { negociacao: "locacao", onEmptyConfirmed: () => { confirmations++; } };
    await extractRezendeData(browser, links, options);
    assert.equal(confirmations, 1);
    ok = false;
    await extractRezendeData(browser, links, options);
    assert.equal(confirmations, 1);
    ok = true;
    globalThis.document.body.innerText = "Carregando...";
    await extractRezendeData(browser, links, options);
    assert.equal(confirmations, 1);
    globalThis.document.body.innerText = "O filtro n\u00e3o retornou nenhum im\u00f3vel!";
    await extractRezendeData(browser, links, { ...options, negociacao: "venda" });
    assert.equal(confirmations, 1);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});