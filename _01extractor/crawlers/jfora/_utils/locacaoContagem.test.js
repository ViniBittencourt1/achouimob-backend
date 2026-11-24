import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { JSDOM } from "jsdom";
import { JF_SPREADSHEET_ID } from "./jfSheetsConfig.js";

const calls = [];
function evaluateDocument(dom, callback) {
  const previous = globalThis.document;
  globalThis.document = dom.window.document;
  try { return callback(); }
  finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
}
let rows = [];
let failWrite = false;
mock.module("../remax/paginacao-api.js", {
  namedExports: { installRemaxSearchBatches: async (page, options) => {
    calls.push(["api", options]);
    return {
      waitUntilReady: async () => page.filteredTotal,
      assertHealthy: () => {},
      close: async () => calls.push(["api-close"]),
    };
  } },
});
mock.module("../../../services/googleSheets.js", {
  namedExports: {
    ensureSheet: async (...args) => { calls.push(["ensure", ...args]); return args[1]; },
    readSheet: async (...args) => { calls.push(["read", ...args]); return rows; },
    writeHeader: async (...args) => calls.push(["header", ...args]),
    writeSheet: async (...args) => { calls.push(["write", ...args]); if (failWrite) throw new Error("Sheets indisponivel"); },
    writeSheets: async (id, data) => {
      if (failWrite) throw new Error("Sheets indisponivel");
      for (const item of data) {
        if (item.range.endsWith("!A1:C1")) calls.push(["header", id, "retorno", item.values[0]]);
        else if (/!A\d+:C\d+$/.test(item.range)) calls.push(["write", id, item.range, item.values]);
      }
    },
  },
});
const { parseTotalLocacaoPadrao, parseTotalLocacaoImobBrasil, parseTotalLocacaoAcervo, parseTotalLocacaoColibex, parseTotalLocacaoSoares, parseTotalLocacaoStart, parseTotalLocacaoToc2, parseTotalLocacaoInvest, parseTotalLocacaoMega, parseTotalLocacaoRemax, parseTotalLocacaoCouto, registrarTotalLocacao, contarAntesDaLocacaoPadrao, contarAntesDaLocacaoImobBrasil, contarAntesDaLocacaoKenlo, contarAntesDaLocacaoAcervo, contarAntesDaLocacaoColibex, contarAntesDaLocacaoSoares, contarAntesDaLocacaoStart, contarAntesDaLocacaoToc2, contarAntesDaLocacaoInvest, contarAntesDaLocacaoMega, contarAntesDaLocacaoRemax, contarAntesDaLocacaoCouto, SPREADSHEET_CONTAGEM_LOCACAO } = await import("./locacaoContagem.js");

test("total do cabecalho aceita espacos, nbsp, zero e milhares sem contar apenas cards visiveis", () => {
  assert.equal(parseTotalLocacaoPadrao(" Imoveis \u00a0\u00a0 (174) "), 174);
  assert.equal(parseTotalLocacaoPadrao("Imoveis (0)"), 0);
  assert.equal(parseTotalLocacaoPadrao("Imoveis (1.234)"), 1234);
  for (const label of ["Imoveis", "Imoveis (-1)", "Imoveis (1.2)", "Imoveis (abc)"]) assert.throws(() => parseTotalLocacaoPadrao(label), /nao identificado/);
});

test("ImobBrasil le 44 no strong e aceita zero e milhares, sem confundir numero da pagina", () => {
  assert.equal(parseTotalLocacaoImobBrasil("44"), 44);
  assert.equal(parseTotalLocacaoImobBrasil(" 0 "), 0);
  assert.equal(parseTotalLocacaoImobBrasil("1.234"), 1234);
  for (const value of ["", "-1", "1.2", "44 imoveis encontrados. Pagina 1"]) assert.throws(() => parseTotalLocacaoImobBrasil(value), /nao identificado/);
});

test("precontagem ImobBrasil usa o strong, registra antes de retornar e fecha pagina", async () => {
  calls.length = 0;
  rows = [["Projeto", "Quantidade"]];
  const page = {
    goto: async () => ({ status: () => 200 }),
    evaluate: async () => false,
    waitForSelector: async selector => assert.equal(selector, ".topsearch__total strong,.topsearch__total b"),
    $$eval: async selector => { assert.equal(selector, ".topsearch__total strong,.topsearch__total b"); return "44"; },
    close: async () => calls.push(["close"]),
  };
  assert.equal(await contarAntesDaLocacaoImobBrasil({ newPage: async () => page }, { projeto: "jfDecisao", url: "https://example.com/imovel/locacao" }), 44);
  assert.deepEqual(calls.find(([name]) => name === "write")[3], [["jfDecisao", 44, "aluguel"]]);
  assert.ok(calls.findIndex(([name]) => name === "write") < calls.findIndex(([name]) => name === "close"));
});

test("aluguel explicitamente desativado nao vira zero e check nao altera Sheets", async () => {
  calls.length = 0;
  const dom = new JSDOM('<p>Este site est&aacute; temporariamente desativado.</p>');
  let waited = false;
  const page = {
    goto: async () => ({ status: () => 200 }),
    evaluate: async callback => evaluateDocument(dom, callback),
    waitForSelector: async () => { waited = true; },
    close: async () => { calls.push(["close"]); dom.window.close(); },
  };
  await assert.rejects(contarAntesDaLocacaoImobBrasil({ newPage: async () => page }, {
    projeto: "jfTeste", url: "https://example.com/imovel/locacao", salvar: false,
  }), error => error.code === "IMOBBRASIL_UNAVAILABLE");
  assert.equal(waited, false);
  assert.deepEqual(calls, [["close"]]);
});

for (const fixture of [
  { projeto: "jfDecisao", total: 44, html: '<p class="topsearch__total"><strong>44</strong> im\u00f3veis encontrados. P\u00e1gina 1</p>' },
  { projeto: "jfTriade", total: 4, html: '<p class="topsearch__total"><b>4</b> im\u00f3veis encontrados. P\u00e1gina 1.</p>' },
  { projeto: "jfImperial", total: 0, html: '<div class="grid-3"><strong>999</strong> Telefone</div><div class="grid-3"><strong>0</strong> im\u00f3veis encontrados. P\u00e1gina 1</div>' },
]) {
  test(`${fixture.projeto}: DOM real do total nao confunde outros numeros ou pagina`, async () => {
    calls.length = 0;
    const dom = new JSDOM(fixture.html);
    const page = {
      goto: async () => ({ status: () => 200 }),
      evaluate: async callback => {
        const previous = globalThis.document;
        globalThis.document = dom.window.document;
        try { return callback(); }
        finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
      },
      waitForSelector: async selector => assert.ok(dom.window.document.querySelector(selector)),
      $$eval: async (selector, callback) => callback(Array.from(dom.window.document.querySelectorAll(selector))),
      close: async () => dom.window.close(),
    };
    assert.equal(await contarAntesDaLocacaoImobBrasil({ newPage: async () => page }, { projeto: fixture.projeto, url: "https://example.com/imovel/locacao" }), fixture.total);
  });
}

test("ImobBrasil rejeita HTTP, total ausente e venda; bloqueio mantem codigo para retry", async () => {
  for (const status of [403, 503, 200]) {
    calls.length = 0;
    const page = { goto: async () => ({ status: () => status }), evaluate: async () => false, waitForSelector: async () => {}, $$eval: async () => "", close: async () => calls.push(["close"]) };
    await assert.rejects(contarAntesDaLocacaoImobBrasil({ newPage: async () => page }, { projeto: "jfAdMyHouse", url: "https://example.com/imovel/locacao" }), error => status === 403 ? error.code === "ADMYHOUSE_BLOCKED" : true);
    assert.ok(calls.some(([name]) => name === "close"));
    assert.ok(!calls.some(([name]) => name === "write"));
  }
  await assert.rejects(contarAntesDaLocacaoImobBrasil({}, { projeto: "jfDecisao", url: "https://example.com/imovel/venda" }), /URL de locacao/);
});

for (const fixture of [
  { folder: "triade", projeto: "jfTriade", exportName: "USER_AGENT_TRIADE", url: "https://www.triadeimoveisjf.com.br/imovel/locacao" },
  { folder: "fluxo", projeto: "jfFluxo", exportName: "USER_AGENT_FLUXO", url: "https://www.fluxoimoveis.com/imovel/locacao" },
  { folder: "positivo", projeto: "jfPositivo", exportName: "USER_AGENT_POSITIVO", url: "https://www.positivoimoveis.com.br/imovel/locacao" },
  { folder: "rvNegocios", projeto: "jfRVNegocios", exportName: "USER_AGENT_RVNEGOCIOS", url: "https://www.rvnegociosimobiliariosjf.com.br/imovel/locacao" },
]) {
  test(`${fixture.projeto} usa User-Agent do extrator na contagem e preserva base se HTTP 403 persistir`, async () => {
    const module = await import(`../${fixture.folder}/extractor.js`);
    const expectedUserAgent = module[fixture.exportName];
    assert.equal(typeof expectedUserAgent, "string");
    let userAgent;
    let status = 200;
    let closed = 0;
    const page = {
      setUserAgent: async value => { userAgent = value; },
      evaluate: async () => false,
      goto: async () => ({ status: () => userAgent === expectedUserAgent ? status : 403 }),
      waitForSelector: async () => {},
      $$eval: async () => "5",
      close: async () => { closed++; },
    };
    const options = { projeto: fixture.projeto, url: fixture.url, userAgent: expectedUserAgent, salvar: false };
    calls.length = 0;
    assert.equal(await contarAntesDaLocacaoImobBrasil({ newPage: async () => page }, options), 5);
    assert.equal(userAgent, expectedUserAgent);
    status = 403;
    await assert.rejects(contarAntesDaLocacaoImobBrasil({ newPage: async () => page }, options), error => error.code === `${fixture.folder.toUpperCase()}_BLOCKED`);
    assert.equal(closed, 2);
    assert.ok(!calls.some(([name]) => name === "write"));
  });
}

test("precontagem Lider registra total ImobBrasil na mesma aba retorno", async () => {
  calls.length = 0;
  rows = [["Projeto", "Quantidade"]];
  const page = {
    evaluate: async () => false,
    setUserAgent: async () => {},
    goto: async () => ({ ok: () => true }),
    url: () => "https://www.lidernegociosimob.com.br/imovel/locacao",
    content: async () => '<h1>Imoveis Disponiveis, Locacao</h1><p class="topsearch__total"><strong>28</strong> imoveis encontrados</p>',
    close: async () => calls.push(["close"]),
  };
  assert.equal(await contarAntesDaLocacaoImobBrasil({ newPage: async () => page }, { projeto: "jfLider", url: "https://www.lidernegociosimob.com.br/imovel/locacao" }), 28);
  assert.deepEqual(calls.find(([name]) => name === "write")[3], [["jfLider", 28, "aluguel"]]);
  assert.ok(calls.some(([name]) => name === "close"));
});

test("retorno registra aluguel com tipo na planilha principal sem sobrescrever contagem de vendas", async () => {
  calls.length = 0;
  rows = [];
  await registrarTotalLocacao("jf1000Imoveis", 174);
  assert.deepEqual(calls.find(([name]) => name === "ensure"), ["ensure", JF_SPREADSHEET_ID, "retorno", 3]);
  assert.deepEqual(calls.find(([name]) => name === "header"), ["header", JF_SPREADSHEET_ID, "retorno", ["Projeto", "Quantidade", "tipo"]]);
  assert.deepEqual(calls.find(([name]) => name === "write"), ["write", JF_SPREADSHEET_ID, "'retorno'!A2:C2", [["jf1000Imoveis", 174, "aluguel"]]]);
});

test("reexecucao atualiza a mesma linha e zero nao apaga outros projetos", async () => {
  calls.length = 0;
  rows = [["Projeto", "Quantidade", "tipo"], ["jf1000Imoveis", 174, "aluguel"], ["jfRezende", 5, "aluguel"]];
  await registrarTotalLocacao("jfRezende", 0);
  assert.deepEqual(calls.find(([name]) => name === "write")[2], "'retorno'!A3:C3");
  assert.deepEqual(calls.find(([name]) => name === "write")[3], [["jfRezende", 0, "aluguel"]]);
  assert.ok(!calls.some(([name]) => name === "header"));
  calls.length = 0;
  await registrarTotalLocacao("jfSouzaGomes", 168);
  assert.deepEqual(calls.find(([name]) => name === "write")[2], "'retorno'!A4:C4");
});

function browserFor({ status = 200, label = "Imoveis (174)", text = "", timeout = false } = {}) {
  const page = {
    goto: async url => { calls.push(["goto", url]); return { status: () => status }; },
    waitForFunction: async () => { calls.push(["wait"]); if (timeout) throw new Error("Timeout"); },
    evaluate: async () => ({ label, text }),
    close: async () => calls.push(["close"]),
  };
  return { newPage: async () => page };
}

test("precontagem registra total antes de fechar a pagina e devolver controle ao extrator", async () => {
  calls.length = 0;
  rows = [];
  assert.equal(await contarAntesDaLocacaoPadrao(browserFor(), { projeto: "jf1000Imoveis", url: "https://example.com/imoveis?negociacao=locacao" }), 174);
  assert.ok(calls.findIndex(([name]) => name === "write") < calls.findIndex(([name]) => name === "close"));
});

test("salvar false consulta quantidade sem ler nem gravar Sheets", async () => {
  calls.length = 0;
  assert.equal(await contarAntesDaLocacaoPadrao(browserFor(), {
    projeto: "jf1000Imoveis", url: "https://example.com/imoveis?negociacao=locacao", salvar: false,
  }), 174);
  assert.ok(calls.some(([name]) => name === "close"));
  assert.ok(!calls.some(([name]) => ["ensure", "read", "write", "header", "batch"].includes(name)));
});

test("HTTP, timeout, total desconhecido e URL de venda nao gravam zero", async () => {
  for (const scenario of [{ status: 503 }, { timeout: true }, { label: "Imoveis" }]) {
    calls.length = 0;
    await assert.rejects(contarAntesDaLocacaoPadrao(browserFor(scenario), { projeto: "jfAlicerce", url: "https://example.com/imoveis?negociacao=locacao" }));
    assert.ok(calls.some(([name]) => name === "close"));
    assert.ok(!calls.some(([name]) => name === "write"));
  }
  calls.length = 0;
  await assert.rejects(contarAntesDaLocacaoPadrao(browserFor(), { projeto: "jfAlicerce", url: "https://example.com/imoveis?negociacao=venda" }), /URL de locacao/);
  assert.equal(calls.length, 0);
});

test("Rezende sem numero exige aviso explicito para registrar zero", async () => {
  const scenario = { label: "Imoveis", text: "O filtro nao retornou nenhum imovel!" };
  calls.length = 0;
  assert.equal(await contarAntesDaLocacaoPadrao(browserFor(scenario), { projeto: "jfRezende", url: "https://example.com/imoveis?negociacao=locacao", allowConfirmedEmpty: true }), 0);
  calls.length = 0;
  await assert.rejects(contarAntesDaLocacaoPadrao(browserFor(scenario), { projeto: "jfAlicerce", url: "https://example.com/imoveis?negociacao=locacao" }));
  assert.ok(!calls.some(([name]) => name === "write"));
});

test("falha no Sheets interrompe a etapa, fecha pagina e permite execucao posterior", async () => {
  calls.length = 0;
  failWrite = true;
  try {
    await assert.rejects(contarAntesDaLocacaoPadrao(browserFor(), { projeto: "jfAlicerce", url: "https://example.com/imoveis?negociacao=locacao" }), /Sheets indisponivel/);
    assert.ok(calls.some(([name]) => name === "close"));
  } finally { failWrite = false; }
  await registrarTotalLocacao("jfAlicerce", 76);
});

function browserForKenlo(html, status = 200, finalUrl = "https://example.com/imoveis/para-alugar") {
  const dom = new JSDOM(html, { url: finalUrl });
  Object.defineProperty(dom.window.document.body, "innerText", { get: () => dom.window.document.body.textContent });
  return { newPage: async () => ({
    goto: async () => ({ status: () => status }),
    evaluate: async callback => {
      const previous = globalThis.document;
      globalThis.document = dom.window.document;
      try { return callback(); }
      finally {
        if (previous === undefined) delete globalThis.document;
        else globalThis.document = previous;
      }
    },
    close: async () => { calls.push(["close"]); dom.window.close(); },
  }) };
}

test("Acervo e Bom Clima interpretam total do titulo de aluguel, zero e milhares", () => {
  assert.equal(parseTotalLocacaoAcervo("18 Im\u00f3veis para alugar"), 18);
  assert.equal(parseTotalLocacaoAcervo("38\u00a0Im\u00f3veis para alugar"), 38);
  assert.equal(parseTotalLocacaoAcervo("0 Imoveis para alugar"), 0);
  assert.equal(parseTotalLocacaoAcervo("1 Imovel para alugar"), 1);
  assert.equal(parseTotalLocacaoAcervo("1.234 Imoveis para alugar"), 1234);
  for (const label of ["", "Imoveis para alugar", "18 Imoveis para venda", "-1 Imoveis para alugar", "1.2 Imoveis para alugar"]) assert.throws(() => parseTotalLocacaoAcervo(label), /nao identificado/);
});

test("Acervo e Bom Clima usam prefixo estavel da classe e gravam total antes de retornar", async () => {
  for (const [projeto, total, suffix] of [["jfAcervo", 18, "KeGMN"], ["jfBomClima", 38, "outroHash"]]) {
    calls.length = 0;
    rows = [["Projeto", "Quantidade"]];
    const dom = new JSDOM(`<h1 class="Title_resultTitle__${suffix}">${total} Im\u00f3veis para alugar</h1>`);
    const page = {
      evaluate: async callback => evaluateDocument(dom, callback),
      goto: async () => ({ status: () => 200 }),
      waitForSelector: async selector => assert.ok(dom.window.document.querySelector(selector)),
      $eval: async (selector, callback) => callback(dom.window.document.querySelector(selector)),
      close: async () => { calls.push(["close"]); dom.window.close(); },
    };
    assert.equal(await contarAntesDaLocacaoAcervo({ newPage: async () => page }, { projeto, url: "https://example.com/imoveis/para-alugar/brasil?order=mais_relevantes" }), total);
    assert.deepEqual(calls.find(([name]) => name === "write")[3], [[projeto, total, "aluguel"]]);
    assert.ok(calls.findIndex(([name]) => name === "write") < calls.findIndex(([name]) => name === "close"));
  }
});

test("Acervo nao registra zero em HTTP, titulo desconhecido ou seletor ausente", async () => {
  for (const scenario of [{ status: 503 }, { status: 200, label: "Carregando" }, { status: 200, missing: true }]) {
    calls.length = 0;
    const page = {
      goto: async () => ({ status: () => scenario.status }),
      evaluate: async () => false,
      waitForSelector: async () => { if (scenario.missing) throw new Error("Seletor ausente"); },
      $eval: async () => scenario.label,
      close: async () => calls.push(["close"]),
    };
    await assert.rejects(contarAntesDaLocacaoAcervo({ newPage: async () => page }, { projeto: "jfAcervo", url: "https://example.com/imoveis/para-alugar/brasil" }));
    assert.ok(calls.some(([name]) => name === "close"));
    assert.ok(!calls.some(([name]) => name === "write"));
  }
  await assert.rejects(contarAntesDaLocacaoAcervo({}, { projeto: "jfAcervo", url: "https://example.com/imoveis/para-comprar/brasil" }), /URL de locacao/);
});

test("Colibex le 36 resultados sem confundir pagina, total de paginas ou intervalo", () => {
  assert.equal(parseTotalLocacaoColibex("P\u00e1gina 1 de 2 \u00b7 1\u201324 de 36 resultados"), 36);
  assert.equal(parseTotalLocacaoColibex("Pagina 2 de 2 - 25-42 de 42 resultados"), 42);
  assert.equal(parseTotalLocacaoColibex("0 resultados"), 0);
  assert.equal(parseTotalLocacaoColibex("1 resultado"), 1);
  assert.equal(parseTotalLocacaoColibex("1\u201324 de 1.234 resultados"), 1234);
  for (const label of ["", "Pagina 1 de 2", "1.2 resultados", "-1 resultados", "Carregando resultados"]) assert.throws(() => parseTotalLocacaoColibex(label), /nao identificado/);
});

test("A Casas e Fogel selecionam o span do total e registram antes de retornar", async () => {
  for (const projeto of ["jfACasas", "jfFogel"]) {
    calls.length = 0;
    rows = [["Projeto", "Quantidade"]];
    const dom = new JSDOM('<span class="heading-color fw600">Outro titulo 99</span><span class="heading-color fw600">P\u00e1gina 1 de 2 \u00b7 1\u201324 de 36 resultados</span>');
    const page = {
      evaluate: async callback => evaluateDocument(dom, callback),
      goto: async () => ({ status: () => 200 }),
      waitForSelector: async selector => assert.ok(dom.window.document.querySelector(selector)),
      $$eval: async (selector, callback) => callback(Array.from(dom.window.document.querySelectorAll(selector))),
      close: async () => { calls.push(["close"]); dom.window.close(); },
    };
    assert.equal(await contarAntesDaLocacaoColibex({ newPage: async () => page }, { projeto, url: "https://example.com/pesquisa?transacao=Loca%C3%A7%C3%A3o" }), 36);
    assert.deepEqual(calls.find(([name]) => name === "write")[3], [[projeto, 36, "aluguel"]]);
    assert.ok(calls.findIndex(([name]) => name === "write") < calls.findIndex(([name]) => name === "close"));
  }
});

test("Colibex preserva contagem em falhas e retorna codigo de bloqueio para retry", async () => {
  for (const scenario of [{ status: 403 }, { status: 503 }, { status: 200, label: "" }, { status: 200, missing: true }]) {
    calls.length = 0;
    const page = {
      evaluate: async () => false,
      goto: async () => ({ status: () => scenario.status }),
      waitForSelector: async () => { if (scenario.missing) throw new Error("Seletor ausente"); },
      $$eval: async () => scenario.label,
      close: async () => calls.push(["close"]),
    };
    await assert.rejects(contarAntesDaLocacaoColibex({ newPage: async () => page }, { projeto: "jfFogel", url: "https://example.com/pesquisa?transacao=Locacao" }), error => scenario.status === 403 ? error.code === "FOGEL_BLOCKED" : true);
    assert.ok(calls.some(([name]) => name === "close"));
    assert.ok(!calls.some(([name]) => name === "write"));
  }
  await assert.rejects(contarAntesDaLocacaoColibex({}, { projeto: "jfACasas", url: "https://example.com/pesquisa?transacao=Venda" }), /URL de locacao/);
});

test("Soares le 4 no aviso Encontramos, aceita zero explicito e rejeita numero ausente", () => {
  assert.equal(parseTotalLocacaoSoares("Encontramos 4 resultados para sua busca"), 4);
  assert.equal(parseTotalLocacaoSoares(" Encontramos\u00a00 resultados para sua busca "), 0);
  assert.equal(parseTotalLocacaoSoares("Encontramos 1 resultado para sua busca"), 1);
  for (const value of ["Encontramos resultados para sua busca", "Encontramos -1 resultados para sua busca", "4", "Carregando"]) assert.throws(() => parseTotalLocacaoSoares(value), /nao identificado/);
});

function browserForSoares({ total = 4, heading = `${total} Imoveis para Alugar`, status = 200, finalUrl = "https://www.secimoveis.com.br/imoveis/aluguel/#/?tipoNegocio=AA", timeout = false } = {}) {
  const dom = new JSDOM(`<h1 class="destaque-titulo">${heading}</h1><p><span class="bold ng-binding">99</span> Outro numero</p><p class="col-xs-12 text-center">Encontramos <span class="bold ng-binding">${total}</span> resultados para sua busca</p>`);
  const evaluate = callback => {
    const previous = globalThis.document;
    globalThis.document = dom.window.document;
    try { return callback(); }
    finally {
      if (previous === undefined) delete globalThis.document;
      else globalThis.document = previous;
    }
  };
  return { newPage: async () => ({
    goto: async () => ({ status: () => status }),
    waitForFunction: async callback => { if (timeout) throw new Error("Timeout Angular"); assert.equal(evaluate(callback), true); },
    evaluate: async callback => evaluate(callback),
    url: () => finalUrl,
    close: async () => { calls.push(["close"]); dom.window.close(); },
  }) };
}

test("Soares aguarda Angular e grava apenas o numero do aviso de resultados", async () => {
  for (const total of [4, 0]) {
    calls.length = 0;
    rows = [["Projeto", "Quantidade"]];
    assert.equal(await contarAntesDaLocacaoSoares(browserForSoares({ total }), { projeto: "jfSoares", url: "https://www.secimoveis.com.br/imoveis/aluguel/#/?tipoNegocio=AA" }), total);
    assert.deepEqual(calls.find(([name]) => name === "write")[3], [["jfSoares", total, "aluguel"]]);
    assert.ok(calls.findIndex(([name]) => name === "write") < calls.findIndex(([name]) => name === "close"));
  }
});

test("Soares conta apos redirecionamento canonico sem barra e sem hash", async () => {
  calls.length = 0;
  rows = [["Projeto", "Quantidade"]];
  assert.equal(await contarAntesDaLocacaoSoares(
    browserForSoares({ finalUrl: "https://www.secimoveis.com.br/imoveis/aluguel" }),
    { projeto: "jfSoares", url: "https://www.secimoveis.com.br/imoveis/aluguel#/?tipoNegocio=AA" },
  ), 4);
  assert.deepEqual(calls.find(([name]) => name === "write")[3], [["jfSoares", 4, "aluguel"]]);
});

test("Soares nao grava em HTTP, timeout, redirecionamento para venda ou totais divergentes", async () => {
  for (const scenario of [{ status: 503 }, { timeout: true }, { heading: "372 Imoveis para Venda" }, { heading: "5 Imoveis para Alugar" }, { finalUrl: "https://www.secimoveis.com.br/imoveis/venda/#/?tipoNegocio=VA,VL" }]) {
    calls.length = 0;
    await assert.rejects(contarAntesDaLocacaoSoares(browserForSoares(scenario), { projeto: "jfSoares", url: "https://www.secimoveis.com.br/imoveis/aluguel/#/?tipoNegocio=AA" }));
    assert.ok(calls.some(([name]) => name === "close"));
    assert.ok(!calls.some(([name]) => name === "write"));
  }
  await assert.rejects(contarAntesDaLocacaoSoares({}, { projeto: "jfSoares", url: "https://www.secimoveis.com.br/imoveis/venda/#/?tipoNegocio=AA" }), /URL de locacao/);
});

test("Start interpreta 1 imoveis encontrados, zero, singular e milhares", () => {
  assert.equal(parseTotalLocacaoStart("1 im\u00f3veis encontrados"), 1);
  assert.equal(parseTotalLocacaoStart("0 imoveis encontrados"), 0);
  assert.equal(parseTotalLocacaoStart("1 Imovel encontrado"), 1);
  assert.equal(parseTotalLocacaoStart("1.234 imoveis encontrados"), 1234);
  for (const label of ["", "Imoveis encontrados", "-1 imoveis encontrados", "1.2 imoveis encontrados", "Carregando"]) assert.throws(() => parseTotalLocacaoStart(label), /nao identificado/);
});

test("Start le h4.top15.left15 e grava total antes de retornar", async () => {
  for (const total of [1, 0]) {
    calls.length = 0;
    rows = [["Projeto", "Quantidade"]];
    const dom = new JSDOM(`<h4>99 imoveis encontrados</h4><h4 class="top15 left15">${total} im\u00f3veis encontrados</h4>`);
    const page = {
      evaluate: async callback => evaluateDocument(dom, callback),
      goto: async () => ({ status: () => 200 }),
      url: () => "https://example.com/imoveis.php?negocio=2",
      waitForSelector: async selector => assert.ok(dom.window.document.querySelector(selector)),
      $eval: async (selector, callback) => callback(dom.window.document.querySelector(selector)),
      close: async () => { calls.push(["close"]); dom.window.close(); },
    };
    assert.equal(await contarAntesDaLocacaoStart({ newPage: async () => page }, { projeto: "jfStart", url: "https://example.com/imoveis.php?negocio=2" }), total);
    assert.deepEqual(calls.find(([name]) => name === "write")[3], [["jfStart", total, "aluguel"]]);
    assert.ok(calls.findIndex(([name]) => name === "write") < calls.findIndex(([name]) => name === "close"));
  }
});

test("Start preserva contagem em HTTP, venda, seletor ausente ou total invalido", async () => {
  for (const scenario of [{ status: 403 }, { status: 503 }, { status: 200, finalUrl: "https://example.com/imoveis.php?negocio=1" }, { status: 200, missing: true }, { status: 200, label: "Carregando" }]) {
    calls.length = 0;
    const page = {
      evaluate: async () => false,
      goto: async () => ({ status: () => scenario.status }),
      url: () => scenario.finalUrl || "https://example.com/imoveis.php?negocio=2",
      waitForSelector: async () => { if (scenario.missing) throw new Error("Seletor ausente"); },
      $eval: async () => scenario.label,
      close: async () => calls.push(["close"]),
    };
    await assert.rejects(contarAntesDaLocacaoStart({ newPage: async () => page }, { projeto: "jfStart", url: "https://example.com/imoveis.php?negocio=2" }), error => scenario.status === 403 ? error.code === "START_BLOCKED" : true);
    assert.ok(calls.some(([name]) => name === "close"));
    assert.ok(!calls.some(([name]) => name === "write"));
  }
  await assert.rejects(contarAntesDaLocacaoStart({}, { projeto: "jfStart", url: "https://example.com/imoveis.php?negocio=1" }), /URL de locacao/);
});

test("TOC2 interpreta 64 Encontrados, zero explicito e milhares", () => {
  assert.equal(parseTotalLocacaoToc2("64 Encontrados"), 64);
  assert.equal(parseTotalLocacaoToc2("0 Encontrados"), 0);
  assert.equal(parseTotalLocacaoToc2("1 Encontrado"), 1);
  assert.equal(parseTotalLocacaoToc2("1.234 Encontrados"), 1234);
  for (const value of ["", "Encontrados", "-1 Encontrados", "1.2 Encontrados", "Carregando"]) assert.throws(() => parseTotalLocacaoToc2(value), /nao identificado/);
});

function browserForToc2({ total = 64, suffix = "ZauDm", status = 200, finalUrl = "https://toc2imoveis.com.br/imoveis/aluguel/-/-/-/-", timeout = false } = {}) {
  const dom = new JSDOM(`<h2>999 Encontrados</h2><h2 class="Properties_qtd1__${suffix}"><span data-nosnippet="true">${total} Encontrados</span></h2>${total ? '<div class="ListPiecesProperties_card_horizontal1__teste"><a href="/imovel/123">Card inicial</a></div>' : ''}`);
  const evaluate = (callback, ...args) => {
    const previous = globalThis.document;
    globalThis.document = dom.window.document;
    try { return callback(...args); }
    finally {
      if (previous === undefined) delete globalThis.document;
      else globalThis.document = previous;
    }
  };
  return { newPage: async () => ({
    goto: async () => ({ status: () => status }),
    url: () => finalUrl,
    evaluate: async callback => evaluate(callback),
    waitForFunction: async (callback, _options, ...args) => { if (timeout) throw new Error("Timeout Next"); assert.equal(evaluate(callback, ...args), true); },
    $eval: async (selector, callback) => callback(dom.window.document.querySelector(selector)),
    close: async () => { calls.push(["close"]); dom.window.close(); },
  }) };
}

test("TOC2 aguarda renderizacao e le total do h2 mesmo com apenas um card visivel", async () => {
  for (const scenario of [{ total: 64 }, { total: 64, suffix: "novoHash" }, { total: 0 }]) {
    calls.length = 0;
    rows = [["Projeto", "Quantidade"]];
    assert.equal(await contarAntesDaLocacaoToc2(browserForToc2(scenario), { projeto: "jfToc2", url: "https://toc2imoveis.com.br/imoveis/aluguel/-/-/-/-" }), scenario.total);
    assert.deepEqual(calls.find(([name]) => name === "write")[3], [["jfToc2", scenario.total, "aluguel"]]);
    assert.ok(calls.findIndex(([name]) => name === "write") < calls.findIndex(([name]) => name === "close"));
  }
});

test("TOC2 preserva contagem em HTTP, timeout, total invalido ou redirecionamento de venda", async () => {
  for (const scenario of [{ status: 503 }, { timeout: true }, { total: "Carregando" }, { finalUrl: "https://toc2imoveis.com.br/imoveis/venda/-/-/-/-" }]) {
    calls.length = 0;
    await assert.rejects(contarAntesDaLocacaoToc2(browserForToc2(scenario), { projeto: "jfToc2", url: "https://toc2imoveis.com.br/imoveis/aluguel/-/-/-/-" }));
    assert.ok(calls.some(([name]) => name === "close"));
    assert.ok(!calls.some(([name]) => name === "write"));
  }
  await assert.rejects(contarAntesDaLocacaoToc2({}, { projeto: "jfToc2", url: "https://toc2imoveis.com.br/imoveis/venda/-/-/-/-" }), /URL de locacao/);
});

test("Invest interpreta Locacao - 163 Imoveis encontrados, zero explicito e milhares", () => {
  assert.equal(parseTotalLocacaoInvest("Loca\u00e7\u00e3o - 163 Im\u00f3veis encontrados"), 163);
  assert.equal(parseTotalLocacaoInvest("Locacao - 0 Imoveis encontrados"), 0);
  assert.equal(parseTotalLocacaoInvest("Locacao - 1 Imovel encontrado"), 1);
  assert.equal(parseTotalLocacaoInvest("Locacao - 1.234 Imoveis encontrados"), 1234);
  for (const label of ["Venda - 163 Imoveis encontrados", "Exibindo 1 ate 135", "Locacao - Imoveis encontrados", "Locacao - -1 Imoveis encontrados", "Locacao - 1.2 Imoveis encontrados"]) assert.throws(() => parseTotalLocacaoInvest(label), /nao identificado/);
});

test("Invest le so o h1 do contador e nao o intervalo de exibicao", async () => {
  for (const total of [163, 0]) {
    calls.length = 0;
    rows = [["Projeto", "Quantidade"]];
    const dom = new JSDOM(`<h1>999 Imoveis encontrados</h1><span id="ContentPlaceHolder1_lblQuantidadeImoveisEncontrados"><h1>Loca\u00e7\u00e3o - ${total} Im\u00f3veis encontrados</h1><p>Exibindo 1 ate 135</p></span>`);
    const page = {
      evaluate: async callback => evaluateDocument(dom, callback),
      goto: async (_url, options) => { assert.equal(options.waitUntil, "domcontentloaded"); return { status: () => 200 }; },
      url: () => "https://www.invest.com.br/ResultadoBusca.aspx?fin=2",
      waitForSelector: async selector => assert.ok(dom.window.document.querySelector(selector)),
      $eval: async (selector, callback) => callback(dom.window.document.querySelector(selector)),
      close: async () => { calls.push(["close"]); dom.window.close(); },
    };
    assert.equal(await contarAntesDaLocacaoInvest({ newPage: async () => page }, { projeto: "jfInvest", url: "https://www.invest.com.br/ResultadoBusca.aspx?fin=2" }), total);
    assert.deepEqual(calls.find(([name]) => name === "write")[3], [["jfInvest", total, "aluguel"]]);
    assert.ok(calls.findIndex(([name]) => name === "write") < calls.findIndex(([name]) => name === "close"));
  }
});

test("Invest nao grava em HTTP, venda, seletor ausente ou total desconhecido", async () => {
  for (const scenario of [{ status: 503 }, { status: 200, finalUrl: "https://www.invest.com.br/ResultadoBusca.aspx?fin=1" }, { status: 200, missing: true }, { status: 200, label: "Carregando" }, { status: 200, label: "Venda - 163 Imoveis encontrados" }]) {
    calls.length = 0;
    const page = {
      evaluate: async () => false,
      goto: async () => ({ status: () => scenario.status }),
      url: () => scenario.finalUrl || "https://www.invest.com.br/ResultadoBusca.aspx?fin=2",
      waitForSelector: async () => { if (scenario.missing) throw new Error("Seletor ausente"); },
      $eval: async () => scenario.label,
      close: async () => calls.push(["close"]),
    };
    await assert.rejects(contarAntesDaLocacaoInvest({ newPage: async () => page }, { projeto: "jfInvest", url: "https://www.invest.com.br/ResultadoBusca.aspx?fin=2" }));
    assert.ok(calls.some(([name]) => name === "close"));
    assert.ok(!calls.some(([name]) => name === "write"));
  }
  await assert.rejects(contarAntesDaLocacaoInvest({}, { projeto: "jfInvest", url: "https://www.invest.com.br/ResultadoBusca.aspx?fin=1" }), /URL de locacao/);
});

test("Mega interpreta apenas o numero da faceta, incluindo zero explicito e milhares", () => {
  assert.equal(parseTotalLocacaoMega("10"), 10);
  assert.equal(parseTotalLocacaoMega(" 0 "), 0);
  assert.equal(parseTotalLocacaoMega("1.234"), 1234);
  for (const value of ["", "-1", "1.2", "10 resultados", "Carregando"]) assert.throws(() => parseTotalLocacaoMega(value), /nao identificado/);
});

test("Mega le faceta10 e grid4 sem depender do id gerado ou outras facetas", async () => {
  for (const total of [10, 0]) {
    calls.length = 0;
    rows = [["Projeto", "Quantidade"]];
    const dom = new JSDOM(`<div class="wpgb-facet" data-facet="10" data-grid="99"><span class="wpgb-result-count">999</span></div><div id="-wpgb-facet-novo-id"><div class="wpgb-facet wpgb-facet-10" data-facet="10" data-grid="4"><span class="wpgb-result-count">${total}</span></div></div>`);
    const page = {
      evaluate: async callback => evaluateDocument(dom, callback),
      goto: async () => ({ status: () => 200 }),
      url: () => "https://megacasaimoveis.com.br/imovel/?_acao=alugar",
      waitForSelector: async selector => assert.ok(dom.window.document.querySelector(selector)),
      $eval: async (selector, callback) => callback(dom.window.document.querySelector(selector)),
      close: async () => { calls.push(["close"]); dom.window.close(); },
    };
    assert.equal(await contarAntesDaLocacaoMega({ newPage: async () => page }, { projeto: "jfMega", url: "https://megacasaimoveis.com.br/imovel/?_acao=alugar" }), total);
    assert.deepEqual(calls.find(([name]) => name === "write")[3], [["jfMega", total, "aluguel"]]);
    assert.ok(calls.findIndex(([name]) => name === "write") < calls.findIndex(([name]) => name === "close"));
  }
});

test("Mega nao grava em HTTP, venda, faceta ausente ou total desconhecido", async () => {
  for (const scenario of [{ status: 503 }, { status: 200, finalUrl: "https://megacasaimoveis.com.br/imovel/?_acao=venda" }, { status: 200, missing: true }, { status: 200, label: "" }]) {
    calls.length = 0;
    const page = {
      evaluate: async () => false,
      goto: async () => ({ status: () => scenario.status }),
      url: () => scenario.finalUrl || "https://megacasaimoveis.com.br/imovel/?_acao=alugar",
      waitForSelector: async () => { if (scenario.missing) throw new Error("Faceta ausente"); },
      $eval: async () => scenario.label,
      close: async () => calls.push(["close"]),
    };
    await assert.rejects(contarAntesDaLocacaoMega({ newPage: async () => page }, { projeto: "jfMega", url: "https://megacasaimoveis.com.br/imovel/?_acao=alugar" }));
    assert.ok(calls.some(([name]) => name === "close"));
    assert.ok(!calls.some(([name]) => name === "write"));
  }
  await assert.rejects(contarAntesDaLocacaoMega({}, { projeto: "jfMega", url: "https://megacasaimoveis.com.br/imovel/?_acao=venda" }), /URL de locacao/);
});

test("RE/MAX interpreta 698 correspondencias, zero explicito e milhares", () => {
  assert.equal(parseTotalLocacaoRemax("698 N\u00famero total de correspond\u00eancias"), 698);
  assert.equal(parseTotalLocacaoRemax("0 Numero total de correspondencias"), 0);
  assert.equal(parseTotalLocacaoRemax("1.234 Numero total de correspondencias"), 1234);
  for (const label of ["", "Numero total de correspondencias", "24", "-1 Numero total de correspondencias", "1.2 Numero total de correspondencias"]) assert.throws(() => parseTotalLocacaoRemax(label), /nao identificado/);
});

const remaxUrl = "https://www.remax.com.br/listings?City=6579324&TransactionTypeUID=260";
function browserForRemax({ total = 698, initialTotal = total, css = "css-1l0ew3p", status = 200, finalUrl = remaxUrl, initialUrl = finalUrl, timeout = false } = {}) {
  const dom = new JSDOM(`<p>24 cards nesta pagina</p><p class="MuiTypography-root MuiTypography-body1 body1-medium ${css}">${initialTotal} N\u00famero total de correspond\u00eancias</p>`);
  let currentUrl = initialUrl;
  return { newPage: async () => ({
    filteredTotal: total,
    evaluate: async callback => evaluateDocument(dom, callback),
    goto: async () => ({ status: () => status }),
    url: () => currentUrl,
    waitForFunction: async (callback, _options, expected) => {
      if (timeout) throw new Error("Timeout React");
      if (typeof expected === "object") {
        const previous = globalThis.location;
        try {
          globalThis.location = { href: currentUrl };
          if (initialUrl !== finalUrl) assert.equal(callback(expected), false);
          currentUrl = finalUrl;
          globalThis.location = { href: currentUrl };
          if (!callback(expected)) throw new Error("Timeout filtros React");
          calls.push(["filters-ready"]);
        } finally {
          if (previous === undefined) delete globalThis.location;
          else globalThis.location = previous;
        }
        return;
      }
      const previous = globalThis.document;
      globalThis.document = dom.window.document;
      try {
        if (initialTotal !== total) assert.equal(callback(expected), false);
        dom.window.document.querySelectorAll("p")[1].textContent = `${total} Numero total de correspondencias`;
        assert.equal(Boolean(callback(expected)), true);
      }
      finally {
        if (previous === undefined) delete globalThis.document;
        else globalThis.document = previous;
      }
    },
    $$eval: async (selector, callback) => callback(Array.from(dom.window.document.querySelectorAll(selector))),
    close: async () => { calls.push(["close"]); dom.window.close(); },
  }) };
}

test("RE/MAX le total do paragrafo por texto estavel sem depender da classe CSS", async () => {
  for (const scenario of [{ total: 698 }, { total: 698, css: "css-novoHash" }, { total: 0 }, { total: 692, initialTotal: 71056 }]) {
    calls.length = 0;
    rows = [["Projeto", "Quantidade"]];
    assert.equal(await contarAntesDaLocacaoRemax(browserForRemax(scenario), { projeto: "jfRemax", url: remaxUrl }), scenario.total);
    assert.deepEqual(calls.find(([name]) => name === "write")[3], [["jfRemax", scenario.total, "aluguel"]]);
    assert.deepEqual(calls.find(([name]) => name === "api")[1], { cityId: 6579324, transactionType: 260 });
    assert.ok(calls.findIndex(([name]) => name === "api-close") < calls.findIndex(([name]) => name === "close"));
  }
});

test("RE/MAX aguarda URL transitoria e aceita normalizacao sem relaxar cidade ou locacao", async () => {
  for (const initialUrl of [
    "https://www.remax.com.br/listings",
    remaxUrl.replace("260", "261"),
    remaxUrl.replace("6579324", "6580792"),
  ]) {
    calls.length = 0;
    rows = [["Projeto", "Quantidade"]];
    const finalUrl = `${remaxUrl}&CityNM=6579324-Minas+Gerais%2C+Juiz+de+Fora`;
    assert.equal(await contarAntesDaLocacaoRemax(browserForRemax({ initialUrl, finalUrl }), { projeto: "jfRemax", url: remaxUrl }), 698);
    assert.ok(calls.findIndex(([name]) => name === "filters-ready") < calls.findIndex(([name]) => name === "write"));
  }
});

test("RE/MAX informa URL recebida quando filtros nao estabilizam e nao grava contagem", async () => {
  calls.length = 0;
  const finalUrl = remaxUrl.replace("260", "261");
  await assert.rejects(
    contarAntesDaLocacaoRemax(browserForRemax({ finalUrl }), { projeto: "jfRemax", url: remaxUrl }),
    error => error.message.includes(finalUrl) && error.message.includes("contagem anterior preservada") && error.cause.message === "Timeout filtros React",
  );
  assert.ok(calls.some(([name]) => name === "api-close"));
  assert.ok(calls.some(([name]) => name === "close"));
  assert.ok(!calls.some(([name]) => name === "write"));
});

test("RE/MAX nao grava em HTTP, timeout, aviso invalido ou redirecionamento de vendas", async () => {
  for (const scenario of [{ status: 503 }, { timeout: true }, { total: "Carregando" }, { finalUrl: remaxUrl.replace("260", "261") }, { finalUrl: remaxUrl.replace("6579324", "6580792") }]) {
    calls.length = 0;
    await assert.rejects(contarAntesDaLocacaoRemax(browserForRemax(scenario), { projeto: "jfRemax", url: remaxUrl }));
    assert.ok(calls.some(([name]) => name === "close"));
    assert.ok(!calls.some(([name]) => name === "write"));
  }
  await assert.rejects(contarAntesDaLocacaoRemax({}, { projeto: "jfRemax", url: "https://www.remax.com.br/listings?TransactionTypeUID=261" }), /URL de locacao/);
});

test("Couto le total depois de de sem confundir o intervalo de resultados", () => {
  assert.equal(parseTotalLocacaoCouto("Resultado(s) 1 - 27 de 27 resultados"), 27);
  assert.equal(parseTotalLocacaoCouto("Resultado(s) 1 - 24 de 100 resultados"), 100);
  assert.equal(parseTotalLocacaoCouto("Resultado(s) 0 - 0 de 0 resultados"), 0);
  assert.equal(parseTotalLocacaoCouto("Resultado(s) 1 - 24 de 1.234 resultados"), 1234);
  for (const label of ["", "Resultado(s) 1 - 27", "de -1 resultados", "de 1.2 resultados", "Carregando"]) assert.throws(() => parseTotalLocacaoCouto(label), /nao identificado/);
});

test("Couto le .pagesNav com numeros em b e registra so o total anunciado", async () => {
  for (const total of [27, 0]) {
    calls.length = 0;
    rows = [["Projeto", "Quantidade"]];
    const dom = new JSDOM(`<div class="pagesNav">Anterior 1 Proximo 2</div><div class="pagesNav">Resultado(s) <b>1</b> - <b>27</b> de <b>${total}</b> resultados</div>`);
    const page = {
      evaluate: async callback => evaluateDocument(dom, callback),
      goto: async () => ({ status: () => 200 }),
      url: () => "https://www.coutoguerraimoveis.com.br/search?acao=s3&finalidade_s=3",
      waitForSelector: async selector => assert.ok(dom.window.document.querySelector(selector)),
      $$eval: async (selector, callback) => callback(Array.from(dom.window.document.querySelectorAll(selector))),
      close: async () => { calls.push(["close"]); dom.window.close(); },
    };
    assert.equal(await contarAntesDaLocacaoCouto({ newPage: async () => page }, { projeto: "jfCouto", url: "https://www.coutoguerraimoveis.com.br/search?acao=s3&finalidade_s=3" }), total);
    assert.deepEqual(calls.find(([name]) => name === "write")[3], [["jfCouto", total, "aluguel"]]);
    assert.ok(calls.findIndex(([name]) => name === "write") < calls.findIndex(([name]) => name === "close"));
  }
});

test("Couto nao grava em HTTP, venda, seletor ausente ou total desconhecido", async () => {
  for (const scenario of [{ status: 503 }, { status: 200, finalUrl: "https://www.coutoguerraimoveis.com.br/search?acao=s1&finalidade_s=2" }, { status: 200, missing: true }, { status: 200, label: "" }]) {
    calls.length = 0;
    const page = {
      evaluate: async () => false,
      goto: async () => ({ status: () => scenario.status }),
      url: () => scenario.finalUrl || "https://www.coutoguerraimoveis.com.br/search?acao=s3&finalidade_s=3",
      waitForSelector: async () => { if (scenario.missing) throw new Error("Seletor ausente"); },
      $$eval: async () => scenario.label,
      close: async () => calls.push(["close"]),
    };
    await assert.rejects(contarAntesDaLocacaoCouto({ newPage: async () => page }, { projeto: "jfCouto", url: "https://www.coutoguerraimoveis.com.br/search?acao=s3&finalidade_s=3" }));
    assert.ok(calls.some(([name]) => name === "close"));
    assert.ok(!calls.some(([name]) => name === "write"));
  }
  for (const params of ["acao=s1&finalidade_s=3", "acao=s3&finalidade_s=2"]) await assert.rejects(contarAntesDaLocacaoCouto({}, { projeto: "jfCouto", url: `https://www.coutoguerraimoveis.com.br/search?${params}` }), /URL de locacao/);
});

test("Kenlo le 39 no cabecalho com nbsp antes de paginar ou extrair os cards", async () => {
  calls.length = 0;
  rows = [["Projeto", "Quantidade"]];
  const html = '<div class="digital-title title" data-title="39 Im\u00f3veis para alugar"><h1>Exibindo&nbsp;<span class="h-money">39&nbsp;</span>Im\u00f3veis para alugar</h1></div><a class="card-with-buttons" href="/imovel/AP0001"><p class="card-with-buttons__value">R$ 1.500</p></a>';
  assert.equal(await contarAntesDaLocacaoKenlo(browserForKenlo(html), { projeto: "jfEstrelaSul", url: "https://example.com/imoveis/para-alugar" }), 39);
  assert.deepEqual(calls.find(([name]) => name === "write")[3], [["jfEstrelaSul", 39, "aluguel"]]);
  assert.ok(calls.findIndex(([name]) => name === "write") < calls.findIndex(([name]) => name === "close"));
});

test("Kenlo antigo le o total mesmo com dois links no mesmo card; tipo singular tambem e aceito", async () => {
  for (const [projeto, heading, total] of [["jfLeal", "37Imoveis para alugar", 37], ["jfCrispi", "1Loja para alugar", 1]]) {
    calls.length = 0;
    const html = `<h1>${heading}</h1><div class="card card-listing"><a href="/imovel/AP0001?from=rent">Foto</a><a href="/imovel/AP0001">Titulo</a><span class="h-money location">R$ 900/mes</span></div>`;
    assert.equal(await contarAntesDaLocacaoKenlo(browserForKenlo(html), { projeto, url: "https://example.com/imoveis/para-alugar" }), total);
  }
});

test("404 Kenlo com aviso explicito confirma zero; 404 generico nao grava", async () => {
  calls.length = 0;
  const html = '<h1>Im\u00f3veis para alugar</h1><p>N\u00e3o encontramos im\u00f3veis para a sua busca</p>';
  assert.equal(await contarAntesDaLocacaoKenlo(browserForKenlo(html, 404), { projeto: "jfGm", url: "https://example.com/imoveis/para-alugar" }), 0);
  calls.length = 0;
  await assert.rejects(contarAntesDaLocacaoKenlo(browserForKenlo('<h1>Pagina nao encontrada</h1>', 404), { projeto: "jfGm", url: "https://example.com/imoveis/para-alugar" }), /HTTP 404/);
  assert.ok(!calls.some(([name]) => name === "write"));
});

test("novo aviso Kenlo vazio grava zero, mas redirecionamento para vendas nao grava", async () => {
  const html = "<h1>Nenhum imovel encontrado</h1><p>Nao encontramos imoveis para esta busca.</p>";
  calls.length = 0;
  rows = [["Projeto", "Quantidade"]];
  assert.equal(await contarAntesDaLocacaoKenlo(
    browserForKenlo(html, 404), { projeto: "jfNunes", url: "https://example.com/imoveis/para-alugar" },
  ), 0);
  assert.deepEqual(calls.find(([name]) => name === "write")[3], [["jfNunes", 0, "aluguel"]]);
  calls.length = 0;
  await assert.rejects(contarAntesDaLocacaoKenlo(
    browserForKenlo(html, 404, "https://example.com/imoveis/a-venda"),
    { projeto: "jfNunes", url: "https://example.com/imoveis/para-alugar" },
  ), /fora da locacao/);
  assert.equal(calls.some(([name]) => name === "write"), false);
});

test("Multimoveis indisponivel so registra zero com a excecao autorizada e sem cards", async () => {
  const options = { projeto: "jfMultimoveis", url: "https://example.com/imoveis/para-alugar", zeroIfUnavailable: true };
  calls.length = 0;
  assert.equal(await contarAntesDaLocacaoKenlo(browserForKenlo('<h1>Prezados clientes</h1>', 503), options), 0);
  assert.deepEqual(calls.find(([name]) => name === "write")[3], [["jfMultimoveis", 0, "aluguel"]]);
  for (const scenario of [
    { options: { ...options, zeroIfUnavailable: false }, html: '<h1>Manutencao</h1>' },
    { options: { ...options, projeto: "jfLocal" }, html: '<h1>Manutencao</h1>' },
    { options, html: '<h1>Manutencao</h1><a class="card-with-buttons" href="/imovel/AP0001"><p class="card-with-buttons__value">R$ 900</p></a>' },
  ]) {
    calls.length = 0;
    await assert.rejects(contarAntesDaLocacaoKenlo(browserForKenlo(scenario.html, 503), scenario.options), /HTTP 503/);
    assert.ok(!calls.some(([name]) => name === "write"));
  }
});

test("Kenlo com total desconhecido ou URL de venda preserva contagem anterior", async () => {
  calls.length = 0;
  await assert.rejects(contarAntesDaLocacaoKenlo(browserForKenlo('<h1>Imoveis para alugar</h1>'), { projeto: "jfMoura", url: "https://example.com/imoveis/para-alugar" }), /Total de alugueis nao identificado/);
  assert.ok(calls.some(([name]) => name === "close"));
  assert.ok(!calls.some(([name]) => name === "write"));
  await assert.rejects(contarAntesDaLocacaoKenlo({}, { projeto: "jfMoura", url: "https://example.com/imoveis/para-venda" }), /URL de locacao/);
});