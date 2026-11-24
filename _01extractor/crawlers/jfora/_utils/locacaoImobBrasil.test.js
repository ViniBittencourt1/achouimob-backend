import assert from "node:assert/strict";
import fs from "node:fs";
import { mock, test } from "node:test";
import { extractDecisaoData } from "../decisao/extractor.js";
import { USER_AGENT_DECISAO } from "../decisao/config.js";
import { projetosLocacaoImobBrasil, getProjetoLocacaoImobBrasil } from "./locacaoImobBrasilProjetos.js";

const calls = [];
let existing = [];
let extracted = [{ linkReal: "https://www.imobiliariadecisaojf.com.br/imovel/1/casa", preco: 1500 }];
let confirmed = false;
let countError = null;
let extractError = null;
mock.module("./locacaoContagem.js", {
  namedExports: { contarAntesDaLocacaoImobBrasil: async (_browser, options) => {
    calls.push(["count", options]);
    if (countError) throw countError;
    return extracted.length || (confirmed ? 0 : 1);
  } },
});
mock.module("node:fs", {
  defaultExport: {
    ...fs,
    existsSync: file => String(file).endsWith("jfDecisaoLocacao.json") && existing.length > 0,
    readFileSync: (file, ...args) => String(file).endsWith("jfDecisaoLocacao.json") ? JSON.stringify(existing) : fs.readFileSync(file, ...args),
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
mock.module("../decisao/extractor.js", {
  namedExports: { extractDecisaoData: async (_browser, _codes, options) => {
    calls.push(["extract", options]);
    if (extractError) throw extractError;
    return { imoveisRaspados: extracted, semImoveisConfirmado: confirmed };
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
const { loadProjetoImobBrasil, runProjetoImobBrasil, SPREADSHEET_LOCACAO_IMOBBRASIL } = await import("./locacaoImobBrasil.js");

for (const headless of [undefined, "false", "true"]) {
  test(`Fontes nao abre janela apos bloqueio com CRAWLER_HEADLESS=${headless}`, async () => {
    const previous = process.env.CRAWLER_HEADLESS;
    try {
      if (headless === undefined) delete process.env.CRAWLER_HEADLESS;
      else process.env.CRAWLER_HEADLESS = headless;
      calls.length = 0;
      countError = Object.assign(new Error("HTTP 403"), { code: "FONTES_BLOCKED" });
      await assert.rejects(runProjetoImobBrasil("fontes"), /HTTP 403/);
      assert.deepEqual(calls.filter(([name]) => name === "browser"), [["browser", { headlessOverride: true }]]);
      assert.equal(calls.filter(([name]) => name === "close").length, 1);
      assert.ok(!calls.some(([name]) => ["json", "clear", "rows", "archive"].includes(name)));
    } finally {
      countError = null;
      if (previous === undefined) delete process.env.CRAWLER_HEADLESS;
      else process.env.CRAWLER_HEADLESS = previous;
    }
  });
}

for (const headless of [undefined, "false", "true"]) {
  test(`Decisao roda oculta com CRAWLER_HEADLESS=${headless}`, async () => {
    const previous = process.env.CRAWLER_HEADLESS;
    try {
      if (headless === undefined) delete process.env.CRAWLER_HEADLESS;
      else process.env.CRAWLER_HEADLESS = headless;
      calls.length = 0;
      await runProjetoImobBrasil("decisao");
      assert.equal(calls.find(([name]) => name === "count")[1].userAgent, USER_AGENT_DECISAO);
      assert.deepEqual(calls.filter(([name]) => name === "browser"), [["browser", { headlessOverride: true }]]);
      assert.equal(calls.filter(([name]) => name === "close").length, 1);
      assert.ok(calls.some(([name]) => name === "extract"));
    } finally {
      if (previous === undefined) delete process.env.CRAWLER_HEADLESS;
      else process.env.CRAWLER_HEADLESS = previous;
    }
  });

  test(`Decisao nao abre janela apos bloqueio com CRAWLER_HEADLESS=${headless}`, async () => {
    const previous = process.env.CRAWLER_HEADLESS;
    try {
      if (headless === undefined) delete process.env.CRAWLER_HEADLESS;
      else process.env.CRAWLER_HEADLESS = headless;
      for (const phase of ["count", "extract"]) {
        calls.length = 0;
        const error = Object.assign(new Error("HTTP 403"), { code: "DECISAO_BLOCKED" });
        countError = phase === "count" ? error : null;
        extractError = phase === "extract" ? error : null;
        await assert.rejects(runProjetoImobBrasil("decisao"), error);
        assert.deepEqual(calls.filter(([name]) => name === "browser"), [["browser", { headlessOverride: true }]]);
        assert.equal(calls.filter(([name]) => name === "close").length, 1);
        assert.ok(!calls.some(([name]) => ["json", "clear", "rows", "archive"].includes(name)));
      }
    } finally {
      countError = null;
      extractError = null;
      if (previous === undefined) delete process.env.CRAWLER_HEADLESS;
      else process.env.CRAWLER_HEADLESS = previous;
    }
  });
}

test("executor Triade fornece o mesmo User-Agent na precontagem e preserva falhas", async () => {
  const { USER_AGENT_TRIADE } = await import("../triade/extractor.js");
  calls.length = 0;
  countError = Object.assign(new Error("HTTP 403 na contagem"), { code: "TRIADE_BLOCKED" });
  try {
    await assert.rejects(runProjetoImobBrasil("triade"), /HTTP 403/);
    assert.equal(calls.find(([name]) => name === "count")[1].userAgent, USER_AGENT_TRIADE);
    assert.ok(calls.some(([name]) => name === "close"));
    assert.ok(!calls.some(([name]) => ["extract", "json", "clear", "rows"].includes(name)));
  } finally { countError = null; }
});

test("executor Fontes fornece user-agent em headless e preserva dados se bloqueado", async () => {
  const { USER_AGENT_FONTES } = await import("../fontes/config.js");
  calls.length = 0;
  countError = Object.assign(new Error("HTTP 403 na contagem"), { code: "FONTES_BLOCKED" });
  try {
    await assert.rejects(runProjetoImobBrasil("fontes"), /HTTP 403/);
    assert.deepEqual(calls.find(([name]) => name === "count")[1], {
      projeto: "jfFontes",
      url: getProjetoLocacaoImobBrasil("fontes").url,
      userAgent: USER_AGENT_FONTES,
    });
    assert.deepEqual(calls.filter(([name]) => name === "browser"), [["browser", { headlessOverride: true }]]);
    assert.equal(calls.filter(([name]) => name === "close").length, 1);
    assert.ok(!calls.some(([name]) => ["extract", "json", "clear", "rows"].includes(name)));
  } finally { countError = null; }
});

test("executor Imperial fornece user-agent em headless e preserva dados se bloqueado", async () => {
  const { USER_AGENT_IMPERIAL } = await import("../imperial/config.js");
  calls.length = 0;
  countError = Object.assign(new Error("HTTP 403 na contagem"), { code: "IMPERIAL_BLOCKED" });
  try {
    await assert.rejects(runProjetoImobBrasil("imperial"), /HTTP 403/);
    assert.deepEqual(calls.find(([name]) => name === "count")[1], {
      projeto: "jfImperial",
      url: getProjetoLocacaoImobBrasil("imperial").url,
      userAgent: USER_AGENT_IMPERIAL,
    });
    assert.deepEqual(calls.filter(([name]) => name === "browser"), [["browser", { headlessOverride: true }]]);
    assert.equal(calls.filter(([name]) => name === "close").length, 1);
    assert.ok(!calls.some(([name]) => ["extract", "json", "clear", "rows"].includes(name)));
  } finally { countError = null; }
});

test("executor Fluxo fornece o User-Agent do extrator em headless sem retry visivel", async () => {
  const { USER_AGENT_FLUXO } = await import("../fluxo/extractor.js");
  calls.length = 0;
  countError = Object.assign(new Error("HTTP 403 na contagem"), { code: "FLUXO_BLOCKED" });
  try {
    await assert.rejects(runProjetoImobBrasil("fluxo"), /HTTP 403/);
    assert.deepEqual(calls.find(([name]) => name === "count")[1], {
      projeto: "jfFluxo",
      url: getProjetoLocacaoImobBrasil("fluxo").url,
      userAgent: USER_AGENT_FLUXO,
    });
    assert.deepEqual(calls.filter(([name]) => name === "browser"), [["browser", { headlessOverride: true }]]);
    assert.equal(calls.filter(([name]) => name === "close").length, 1);
    assert.ok(!calls.some(([name]) => ["extract", "json", "clear", "rows"].includes(name)));
  } finally { countError = null; }
});

test("executor Positivo fornece o User-Agent do extrator em headless e preserva dados se bloqueado", async () => {
  const { USER_AGENT_POSITIVO } = await import("../positivo/extractor.js");
  calls.length = 0;
  countError = Object.assign(new Error("HTTP 403 na contagem"), { code: "POSITIVO_BLOCKED" });
  try {
    await assert.rejects(runProjetoImobBrasil("positivo"), /HTTP 403/);
    assert.deepEqual(calls.find(([name]) => name === "count")[1], {
      projeto: "jfPositivo",
      url: getProjetoLocacaoImobBrasil("positivo").url,
      userAgent: USER_AGENT_POSITIVO,
    });
    assert.deepEqual(calls.filter(([name]) => name === "browser"), [["browser", { headlessOverride: true }]]);
    assert.equal(calls.filter(([name]) => name === "close").length, 1);
    assert.ok(!calls.some(([name]) => ["extract", "json", "clear", "rows"].includes(name)));
  } finally { countError = null; }
});

test("executor RV Negocios fornece o User-Agent do extrator em headless e preserva dados se bloqueado", async () => {
  const { USER_AGENT_RVNEGOCIOS } = await import("../rvNegocios/extractor.js");
  calls.length = 0;
  countError = Object.assign(new Error("HTTP 403 na contagem"), { code: "RVNEGOCIOS_BLOCKED" });
  try {
    await assert.rejects(runProjetoImobBrasil("rvNegocios"), /HTTP 403/);
    assert.deepEqual(calls.find(([name]) => name === "count")[1], {
      projeto: "jfRVNegocios",
      url: getProjetoLocacaoImobBrasil("rvNegocios").url,
      userAgent: USER_AGENT_RVNEGOCIOS,
    });
    assert.deepEqual(calls.filter(([name]) => name === "browser"), [["browser", { headlessOverride: true }]]);
    assert.equal(calls.filter(([name]) => name === "close").length, 1);
    assert.ok(!calls.some(([name]) => ["extract", "json", "clear", "rows"].includes(name)));
  } finally { countError = null; }
});

test("Decisao usa URL de locacao e confirma vazio apenas com aviso valido", async () => {
  const previousDocument = globalThis.document;
  const timer = mock.method(globalThis, "setTimeout", callback => { queueMicrotask(callback); return 0; });
  let status = 200;
  const urls = [];
  const page = {
    setUserAgent: async () => {},
    setExtraHTTPHeaders: async () => {},
    setViewport: async () => {},
    evaluateOnNewDocument: async () => {},
    goto: async url => { urls.push(url); return { ok: () => status === 200, status: () => status }; },
    waitForSelector: async () => {},
    evaluate: async () => ({ imvelcardCount: 0, allDivCardsCount: 0 }),
    close: async () => {},
  };
  let evaluations = 0;
  page.evaluate = async () => {
    const step = ++evaluations % 3;
    if (step === 1) return { imvelcardCount: 0, allDivCardsCount: 0 };
    if (step === 2) return [];
    return /\b0\s+im[o\u00f3]veis\s+encontrados\b/i.test(globalThis.document.body.innerText);
  };
  const browser = { newPage: async () => page };
  const options = { baseUrl: "https://www.imobiliariadecisaojf.com.br/imovel/locacao", strict: true };
  try {
    globalThis.document = { body: { innerText: "0 im\u00f3veis encontrados. P\u00e1gina 1" } };
    const result = await extractDecisaoData(browser, new Set(), options);
    assert.equal(result.semImoveisConfirmado, true);
    assert.equal(urls[0], options.baseUrl);
    globalThis.document.body.innerText = "Carregando";
    await assert.rejects(extractDecisaoData(browser, new Set(), options), /sem confirmacao/);
    status = 403;
    await assert.rejects(extractDecisaoData(browser, new Set(), options), error => error.code === "DECISAO_BLOCKED");
  } finally {
    timer.mock.restore();
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

for (const projeto of projetosLocacaoImobBrasil) {
  if (projeto.extractorFile) {
    test(`${projeto.collection}: adaptador especifico e carregado pelo lote`, async () => {
      const functions = await loadProjetoImobBrasil(projeto);
      assert.equal(typeof functions.extract, "function");
      assert.equal(new URL(projeto.url).pathname, "/imovel/locacao");
    });
    continue;
  }
  test(`${projeto.collection}: URL configuravel, vazio confirmado e erros propagados`, async () => {
    const module = await import(`../${projeto.folder}/extractor.js`);
    const extract = projeto.folder === "decisao" ? extractDecisaoData : module[projeto.extractor];
    assert.equal(typeof extract, "function");
    let status = 200;
    let empty = true;
    let finalUrl;
    const timer = mock.method(globalThis, "setTimeout", callback => { queueMicrotask(callback); return 0; });
    const page = {
      setUserAgent: async () => {}, setExtraHTTPHeaders: async () => {}, setViewport: async () => {},
      evaluateOnNewDocument: async () => {}, waitForSelector: async () => {}, close: async () => {},
      goto: async url => { finalUrl = url; return { ok: () => status === 200, status: () => status }; },
      url: () => finalUrl,
      $eval: async () => empty ? 0 : null,
      title: async () => "Imoveis para Locacao",
      evaluate: async callback => {
        const source = String(callback);
        if (source.includes('document.body.innerText')) return empty;
        if (source.includes('bodyHTML')) return { imvelcardCount: 0, allDivCardsCount: 0 };
        if (source.includes('linksImovel')) return { cardsLayout: 0, linksImovel: 0 };
        return [];
      },
    };
    const browser = { newPage: async () => page };
    try {
      const options = { baseUrl: projeto.url, strict: true };
      const result = await extract(browser, new Set(), options);
      assert.equal(result.semImoveisConfirmado, true);
      if (projeto.folder === "fluxo") {
        const destination = new URL(finalUrl);
        assert.equal(destination.origin + destination.pathname, projeto.url);
        assert.equal(destination.searchParams.get("ord"), "recentes");
        assert.equal(destination.searchParams.get("pag"), "1");
      } else {
        assert.equal(finalUrl, projeto.url);
      }
      empty = false;
      await assert.rejects(extract(browser, new Set(), options), projeto.folder === "fluxo" ? /Contagem mudou ou nao foi identificada/ : /sem confirmacao/);
      status = 403;
      await assert.rejects(extract(browser, new Set(), options), error => error.code?.endsWith("_BLOCKED"));
    } finally { timer.mock.restore(); }
  });
  test(`${projeto.collection}: leitor de preco original e preservado`, async () => {
    const { extractPreco } = await import(`../${projeto.folder}/extractor-03-preco.js`);
    const html = projeto.folder === "imperial"
      ? '<div class="item-lista"><td>R$380,00 m2</td><li>R$ 1.500,00</li></div>'
      : '<div class="imovelcard"><p class="imovelcard__valor__valor">R$ 1.500,00</p></div>';
    assert.equal(extractPreco(html), 1500);
  });
  test(`${projeto.collection}: Sheets unificado, defaults de venda e consolidacao`, async () => {
    const functions = await loadProjetoImobBrasil(projeto);
    const data = functions.consolidate([{ linkReal: "teste", preco: 1500 }], new Map());
    assert.ok(data instanceof Map);
    assert.equal(data.get("teste").preco, 1500);
    calls.length = 0;
    const previous = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY";
    try {
      await functions.exportToSheets(data);
      assert.deepEqual(calls.find(([name]) => name === "clear"), ["clear", "1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY", projeto.collection]);
      calls.length = 0;
      await functions.exportToSheets(data, { spreadsheetId: SPREADSHEET_LOCACAO_IMOBBRASIL, sheetName: projeto.collection });
      assert.deepEqual(calls.find(([name]) => name === "clear"), ["clear", SPREADSHEET_LOCACAO_IMOBBRASIL, projeto.collection]);
      assert.equal(calls.find(([name]) => name === "header")[3].length, 21);
    } finally {
      if (previous === undefined) delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
      else process.env.GOOGLE_SHEETS_SPREADSHEET_ID = previous;
    }
  });
}

test("executor cria apenas JSON de locacao e escolhe aba herdada", async () => {
  calls.length = 0;
  await runProjetoImobBrasil("decisao");
  assert.deepEqual(calls.find(([name]) => name === "count")[1], { projeto: "jfDecisao", url: getProjetoLocacaoImobBrasil("decisao").url, userAgent: USER_AGENT_DECISAO });
  assert.ok(calls.findIndex(([name]) => name === "count") < calls.findIndex(([name]) => name === "extract"));
  assert.match(calls.find(([name]) => name === "json")[1], /jfDecisaoLocacao\.json$/);
  assert.equal(calls.find(([name]) => name === "extract")[1].strict, true);
  assert.deepEqual(calls.find(([name]) => name === "clear"), ["clear", SPREADSHEET_LOCACAO_IMOBBRASIL, "jfDecisao"]);
});

test("falha na precontagem impede extracao e preserva dados do lote", async () => {
  calls.length = 0;
  countError = new Error("Contagem indisponivel");
  try {
    await assert.rejects(runProjetoImobBrasil("decisao"), /Contagem indisponivel/);
    assert.ok(calls.some(([name]) => name === "close"));
    assert.ok(!calls.some(([name]) => ["extract", "json", "clear", "rows"].includes(name)));
  } finally { countError = null; }
});

test("primeiro vazio confirmado prepara JSON e cabecalho; historico existente e preservado", async () => {
  calls.length = 0;
  extracted = [];
  confirmed = true;
  await runProjetoImobBrasil("decisao");
  assert.equal(calls.find(([name]) => name === "json")[2], "[]");
  assert.ok(calls.some(([name]) => name === "header"));
  existing = [{ linkReal: "https://example.com/imovel/retirado", preco: 1500 }];
  calls.length = 0;
  await runProjetoImobBrasil("decisao");
  assert.ok(calls.some(([name]) => name === 'archive'));
  assert.ok(calls.some(([name]) => name === 'clear'));
});

test("vazio sem aviso nao altera destinos", async () => {
  calls.length = 0;
  confirmed = false;
  await assert.rejects(runProjetoImobBrasil("decisao"), /sem confirmacao/);
  assert.ok(!calls.some(([name]) => ["json", "clear", "rows"].includes(name)));
});

test("Lider usa adaptador da plataforma nova em vez do extrator legado", () => {
  assert.equal(getProjetoLocacaoImobBrasil("jfLider").extractorFile, "extractor-locacao.js");
});