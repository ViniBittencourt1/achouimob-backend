import assert from "node:assert/strict";
import fs from "node:fs";
import { mock, test } from "node:test";
import { JSDOM } from "jsdom";
import { extractPrecoKenloLocacao } from "./locacaoKenloPreco.js";
import { extractPreco as extractPrecoLocalVenda } from "../local/extractor-03-preco.js";
import { validateKenloPage, loadCamposKenlo, mapCardKenloLocacao, readSnapshotKenloLocacao, collectCardsKenloLocacao } from "./locacaoKenloExtractor.js";
import { projetosLocacaoKenlo } from "./locacaoKenloProjetos.js";
import { reconciliarLocacao } from "./locacaoSincronizacao.js";

const calls = [];
let existing = [];
let result = { imoveisRaspados: [{ linkReal: "https://www.crispiimoveis.com.br/imovel/teste", titulo: "Loja", preco: 850, codigoBase: "LO0005-CRMQ", cidade: "juiz-de-fora-mg" }], semImoveisConfirmado: false };
let extractionError = null;
let countError = null;
mock.module("./locacaoContagem.js", {
  namedExports: { contarAntesDaLocacaoKenlo: async (_browser, options) => {
    calls.push(["count", options]);
    if (countError) throw countError;
    return result.imoveisRaspados.length || (result.semImoveisConfirmado || extractionError?.code === 'LOCACAO_UNAVAILABLE' ? 0 : 1);
  } },
});
mock.module("node:fs", {
  defaultExport: { ...fs, existsSync: file => String(file).endsWith("jfCrispiLocacao.json") && existing.length > 0, readFileSync: (file, ...args) => String(file).endsWith("jfCrispiLocacao.json") ? JSON.stringify(existing) : fs.readFileSync(file, ...args), mkdirSync: (...args) => calls.push(["mkdir", ...args]), writeFileSync: (...args) => calls.push(["json", ...args]) },
});
mock.module("../../../services/puppeteerPool.js", {
  namedExports: { abrirBrowser: async () => ({ close: async () => calls.push(["close"]) }) },
});
mock.module("./locacaoKenloExtractor.js", {
  namedExports: { loadCamposKenlo, extractKenloLocacao: async () => { calls.push(["extract"]); if (extractionError) throw extractionError; return result; } },
});
mock.module("../../../services/googleSheets.js", {
  namedExports: { ensureSheet: async (_id, title) => title, readSheet: async () => [], appendRows: async (...args) => calls.push(['archive', ...args]), clearSheet: async (...args) => calls.push(["clear", ...args]), writeHeader: async (...args) => calls.push(["header", ...args]), writeSheet: async (...args) => calls.push(["rows", ...args]) },
});
const { loadProjetoKenlo, runProjetoKenlo, SPREADSHEET_LOCACAO_KENLO } = await import("./locacaoKenlo.js");

export const cardMistoKenlo = '<div class="card-with-buttons__value-container"><p class="card-with-buttons__value-title">Venda</p><p class="card-with-buttons__value">R$ 450.000</p></div><div class="card-with-buttons__value-container"><p class="card-with-buttons__value-title">Aluguel</p><p class="card-with-buttons__value">R$ 1.500,50/m\u00eas</p></div>';

test("Kenlo moderno seleciona aluguel; preco original de venda permanece igual", () => {
  assert.equal(extractPrecoKenloLocacao(cardMistoKenlo), 1500.5);
  assert.equal(extractPrecoLocalVenda(cardMistoKenlo), 450000);
});

test("Kenlo split da Toronto tambem seleciona aluguel pelo rotulo", () => {
  assert.equal(extractPrecoKenloLocacao(cardMistoKenlo.replaceAll("card-with-buttons", "card_split_vertically")), 1500.5);
});

test("Sob consulta e null; card so de venda e rejeitado", () => {
  assert.equal(extractPrecoKenloLocacao(cardMistoKenlo.replace("R$ 1.500,50/m\u00eas", "Sob consulta")), null);
  assert.throws(() => extractPrecoKenloLocacao(cardMistoKenlo.replace("Aluguel", "Venda")), /Rotulo de aluguel/);
});

test("layout antigo seleciona valor mensal sem confundir venda", () => {
  const html = '<span class="h-money location">R$ 900/m\u00eas</span><span class="h-money location">R$ 270.000</span>';
  assert.equal(extractPrecoKenloLocacao(html), 900);
  assert.throws(() => extractPrecoKenloLocacao('<span class="h-money location">R$ 270.000</span>'), /Rotulo de aluguel/);
});

test("404 Kenlo com aviso explicito e vazio; 503 nao e ausencia de alugueis", () => {
  const info = { heading: "Im\u00f3veis para alugar", text: "N\u00e3o encontramos im\u00f3veis para a sua busca", cards: [] };
  assert.equal(validateKenloPage(404, info).semImoveisConfirmado, true);
  assert.throws(() => validateKenloPage(503, info), /HTTP 503/);
  assert.throws(() => validateKenloPage(404, { ...info, text: "Pagina nao encontrada" }), /HTTP 404/);
});

test("totais modernos e antigos sao interpretados sem confundir preco", () => {
  assert.equal(validateKenloPage(200, { heading: "Exibindo 52 Im\u00f3veis para alugar", text: "", cards: [] }).total, 52);
  assert.equal(validateKenloPage(200, { heading: "37Im\u00f3veis para alugar", text: "", cards: [] }).total, 37);
  assert.equal(validateKenloPage(200, { heading: "1Loja de 24 m\u00b2 para alugar", text: "", cards: [] }).total, 1);
});

test("404 com novo aviso de busca vazia exige rota de aluguel e ausencia de cards", () => {
  const info = {
    url: "https://www.nunesimoveisjf.com.br/imoveis/para-alugar",
    heading: "Nenhum imovel encontrado", text: "Nao encontramos imoveis para esta busca.", cards: [],
  };
  for (const status of [200, 404]) {
    assert.deepEqual(validateKenloPage(status, info), { total: 0, semImoveisConfirmado: true });
  }
  for (const changes of [
    { url: "https://example.com/imoveis/a-venda" },
    { heading: "Pagina nao encontrada" },
    { text: "Erro no servidor" },
    { cards: [{ href: "https://example.com/imovel/1" }] },
  ]) assert.throws(() => validateKenloPage(404, { ...info, ...changes }), /HTTP 404/);
  assert.throws(() => validateKenloPage(503, info), /HTTP 503/);
});

test("Leal conta cada card uma vez mesmo com links de foto e titulo diferentes", () => {
  const dom = new JSDOM('<h1>37Imoveis para alugar</h1><div class="card card-listing"><a href="/imovel/apartamento/AP0287-AL44?from=rent">Foto</a><a href="/imovel/apartamento-centro/AP0287-AL44">Titulo</a><span class="h-money location">R$ 900/mes</span></div>', { url: "https://www.lealimoveismb.com.br" });
  const previous = globalThis.document;
  globalThis.document = dom.window.document;
  try {
    const info = readSnapshotKenloLocacao();
    assert.equal(info.cards.length, 1);
    assert.equal(info.cards[0].href, "https://www.lealimoveismb.com.br/imovel/apartamento/AP0287-AL44?from=rent");
    assert.match(info.cards[0].html, /card-listing/);
    assert.equal(readSnapshotKenloLocacao(1), null);
    dom.window.document.body.insertAdjacentHTML("beforeend", '<div class="card card-listing"><a href="/imovel/apartamento/AP0302-AL44?from=rent">Foto</a><a href="/imovel/apartamento/AP0302-AL44">Titulo</a><span class="h-money location">R$ 1.000/mes</span></div>');
    assert.equal(readSnapshotKenloLocacao(1).cards.length, 2);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
    dom.window.close();
  }
});

test("snapshot mantem layouts moderno e split e ignora links fora de cards", () => {
  const dom = new JSDOM('<a class="card-with-buttons" href="/imovel/casa/CA0001"><p class="card-with-buttons__value">R$ 900</p></a><a class="card_split_vertically" href="/imovel/casa/CA0002"><p class="card_split_vertically__value">R$ 1.000</p></a><a href="/imovel/fora"><span class="h-money location">R$ 100/mes</span></a>', { url: "https://example.com" });
  const previous = globalThis.document;
  globalThis.document = dom.window.document;
  try {
    assert.deepEqual(readSnapshotKenloLocacao().cards.map(card => card.href), ["https://example.com/imovel/casa/CA0001", "https://example.com/imovel/casa/CA0002"]);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
    dom.window.close();
  }
});

function fakeLealPages({ missing = false, repeated = false, cumulative = false, changedTotal = false, base = 'https://www.lealimoveismb.com.br/imoveis/para-alugar', total = 36 } = {}) {
  let current = base;
  let closed = false;
  const visits = [];
  function withDocument(callback, argument) {
    const number = Number(new URL(current).searchParams.get('pagina') || 1);
    const start = repeated || cumulative ? 0 : (number - 1) * 12;
    const count = cumulative ? Math.min(number * 12, total) : Math.min(12, total - (number - 1) * 12);
    const cards = Array.from({ length: count }, (_, index) => `<div class="card card-listing"><a href="/imovel/apartamento/AP${start + index}?from=rent">Foto</a><span class="h-money location">R$ 900/mes</span></div>`).join('');
    const next = missing || number === Math.ceil(total / 12) ? '' : `<a class="btn-next" href="${base}?pagina=${number + 1}">Ver mais</a>`;
    const headingTotal = changedTotal && number > 1 ? total + 1 : total;
    const dom = new JSDOM(`<h1>${headingTotal}Imoveis para alugar</h1>${cards}${next}`, { url: current });
    const previous = globalThis.document;
    globalThis.document = dom.window.document;
    try { return callback(argument); }
    finally {
      if (previous === undefined) delete globalThis.document;
      else globalThis.document = previous;
      dom.window.close();
    }
  }
  const page = {
    goto: async url => { current = url; visits.push(url); return { status: () => 200 }; },
    url: () => current,
    evaluate: async callback => withDocument(callback),
    evaluateHandle: async () => ({
      asElement: () => withDocument(() => document.querySelector('a.btn-next')) ? {
        evaluate: async callback => withDocument(() => callback(document.querySelector('a.btn-next'))),
        click: async () => { current = withDocument(() => document.querySelector('a.btn-next').href); },
      } : null,
      dispose: async () => {},
    }),
    waitForFunction: async (callback, _options, minimum) => {
      const info = withDocument(callback, minimum);
      if (!info) throw new Error('Waiting failed: 30000ms exceeded');
      return { jsonValue: async () => info, dispose: async () => {} };
    },
    close: async () => { closed = true; },
  };
  return { browser: { newPage: async () => page }, projeto: { collection: 'jfLeal', url: base }, visits, closed: () => closed };
}

test('Leal segue links de paginas e acumula 36 cards mesmo com 12 por pagina', async () => {
  const fixture = fakeLealPages();
  const result = await collectCardsKenloLocacao(fixture.browser, fixture.projeto);
  assert.equal(result.cards.length, 36);
  assert.equal(new Set(result.cards.map(card => card.href)).size, 36);
  assert.equal(fixture.visits.length, 3);
  assert.equal(fixture.closed(), true);
});

test('Leal nao aceita pagina faltante ou repetida como aluguel completo', async () => {
  for (const options of [{ missing: true }, { repeated: true }]) {
    const fixture = fakeLealPages(options);
    await assert.rejects(collectCardsKenloLocacao(fixture.browser, fixture.projeto), /ausente|progresso|repetida|Waiting failed/);
    assert.equal(fixture.closed(), true);
  }
});

test('Leal preserva dados quando o total muda entre paginas', async () => {
  const fixture = fakeLealPages({ changedTotal: true });
  await assert.rejects(collectCardsKenloLocacao(fixture.browser, fixture.projeto), /Total de alugueis Leal mudou/);
  assert.equal(fixture.closed(), true);
});

test('Local segue cinco paginas de 12, 12, 12, 12 e 3 cards sem exigir carregamento cumulativo', async () => {
  const fixture = fakeLealPages({ base: 'https://www.localimoveisjf.com.br/imoveis/para-alugar', total: 51 });
  const result = await collectCardsKenloLocacao(fixture.browser, { ...fixture.projeto, collection: 'jfLocal' });
  assert.equal(result.cards.length, 51);
  assert.equal(new Set(result.cards.map(card => card.href)).size, 51);
  assert.equal(fixture.visits.length, 5);
  assert.ok(fixture.visits.every(url => new URL(url).searchParams.get('ordenar') === 'recentes'));
  assert.equal(fixture.closed(), true);
});

test('Local nao publica coleta incompleta, repetida ou com total alterado', async () => {
  for (const options of [{ missing: true }, { repeated: true }, { changedTotal: true }]) {
    const fixture = fakeLealPages({ ...options, base: 'https://www.localimoveisjf.com.br/imoveis/para-alugar', total: 51 });
    await assert.rejects(collectCardsKenloLocacao(fixture.browser, { ...fixture.projeto, collection: 'jfLocal' }), /ausente|progresso|repetida|Waiting failed|Total de alugueis Local mudou/);
    assert.equal(fixture.closed(), true);
  }
});

test('Oliveira segue cinco paginas e acumula exatamente 52 alugueis unicos', async () => {
  const fixture = fakeLealPages({ base: 'https://www.joliveirajf.com.br/imoveis/para-alugar', total: 52 });
  const result = await collectCardsKenloLocacao(fixture.browser, { ...fixture.projeto, collection: 'jfOliveira' });
  assert.equal(result.cards.length, 52);
  assert.equal(new Set(result.cards.map(card => card.href)).size, 52);
  assert.equal(fixture.visits.length, 5);
  assert.equal(new URL(fixture.visits[4]).searchParams.get('pagina'), '5');
  assert.equal(fixture.closed(), true);
});

test('Oliveira rejeita paginas faltantes, repetidas e alteracao do total sem retornar coleta parcial', async () => {
  for (const options of [{ missing: true }, { repeated: true }, { changedTotal: true }]) {
    const fixture = fakeLealPages({ ...options, base: 'https://www.joliveirajf.com.br/imoveis/para-alugar', total: 52 });
    await assert.rejects(collectCardsKenloLocacao(fixture.browser, { ...fixture.projeto, collection: 'jfOliveira' }), /ausente|progresso|repetida|Waiting failed|Total de alugueis Oliveira mudou/);
    assert.equal(fixture.closed(), true);
  }
});

test('Masson segue sete paginas e acumula 73 alugueis sem esperar crescimento do DOM', async () => {
  const fixture = fakeLealPages({ base: 'https://www.massonimoveis.com.br/imoveis/para-alugar', total: 73 });
  const result = await collectCardsKenloLocacao(fixture.browser, { ...fixture.projeto, collection: 'jfMasson' });
  assert.equal(result.cards.length, 73);
  assert.equal(new Set(result.cards.map(card => card.href)).size, 73);
  assert.equal(fixture.visits.length, 7);
  assert.equal(new URL(fixture.visits[6]).searchParams.get('pagina'), '7');
  assert.equal(fixture.closed(), true);
});

test('Masson preserva a base quando faltam paginas, nao ha progresso ou o total muda', async () => {
  for (const options of [{ missing: true }, { repeated: true }, { changedTotal: true }]) {
    const fixture = fakeLealPages({ ...options, base: 'https://www.massonimoveis.com.br/imoveis/para-alugar', total: 73 });
    await assert.rejects(collectCardsKenloLocacao(fixture.browser, { ...fixture.projeto, collection: 'jfMasson' }), /ausente|progresso|repetida|Waiting failed|Total de alugueis Masson mudou/);
    assert.equal(fixture.closed(), true);
  }
});

test('outros projetos Kenlo mantem carregamento cumulativo sem navegar novamente', async () => {
  const fixture = fakeLealPages({ cumulative: true });
  const result = await collectCardsKenloLocacao(fixture.browser, { ...fixture.projeto, collection: 'jfCrispi' });
  assert.equal(result.cards.length, 36);
  assert.equal(fixture.visits.length, 1);
  assert.equal(fixture.closed(), true);
});

for (const projeto of projetosLocacaoKenlo) {
  test(`${projeto.collection}: campos proprios carregam sem alterar vendas`, async () => {
    const fields = await loadCamposKenlo(projeto);
    assert.equal(typeof fields.cidade, "function");
    assert.equal(typeof fields.bairro, "function");
    assert.equal(new URL(projeto.url).pathname, "/imoveis/para-alugar");
    assert.equal(new URL(projeto.url).search, "");
  });
  test(`${projeto.collection}: Sheets unificado, aba herdada e defaults de vendas`, async () => {
    const functions = await loadProjetoKenlo(projeto);
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
      await functions.exportToSheets(data, { spreadsheetId: SPREADSHEET_LOCACAO_KENLO, sheetName: projeto.collection });
      assert.deepEqual(calls.find(([name]) => name === "clear"), ["clear", SPREADSHEET_LOCACAO_KENLO, projeto.collection]);
      assert.equal(calls.find(([name]) => name === "header")[3].length, 21);
    } finally {
      if (previous === undefined) delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
      else process.env.GOOGLE_SHEETS_SPREADSHEET_ID = previous;
    }
  });
}

test("codigo moderno e usado apenas como fallback no mapeamento de locacao", async () => {
  const fields = Object.fromEntries(["titulo","cidade","bairro","localizacao","tipoImovel","dormitorioValor","banheiroValor","ambienteValor","areaValor","garagemValor","elevadorValor","codigoBase","linkCard","corretor","dataInclusao","linkFoto","atualizadoEm"].map(name => [name, () => ""]));
  fields.titulo = () => "Casa";
  fields.cidade = () => "lima-duarte-mg";
  fields.tipoImovel = () => "casa";
  const html = '<p class="card-with-buttons__code">CA0122-TRIQ</p><h2 class="card-with-buttons__heading">Casa Concei\u00e7\u00e3o de Ibitipoca - Lima Duarte - MG</h2><ul><li>55 m\u00b2</li><li>2 Quartos</li></ul>' + cardMistoKenlo;
  const result = await mapCardKenloLocacao({ collection: "jfTriplice" }, { href: "https://example.com/imovel/casa/CA0122-TRIQ", html }, fields);
  assert.equal(result.codigoBase, "CA0122-TRIQ");
  assert.equal(result.bairro, "conceicao-de-ibitipoca");
  assert.equal(result.areaValor, 55);
  assert.equal(result.dormitorioValor, 2);
});

test("Moura moderno mapeia os 20 campos e renova atualizadoEm sem usar preco de venda", async () => {
  const projeto = projetosLocacaoKenlo.find(item => item.collection === "jfMoura");
  const fields = await loadCamposKenlo(projeto);
  const href = "https://www.mouraimoveisjf.com.br/imovel/apartamento/AP5810-MOUY?from=rent";
  const html = `<a class="card-with-buttons" href="${href}">
    <p class="card-with-buttons__code">AP5810-MOUY</p>
    <p class="card-with-buttons__title">Apartamento</p>
    <h2 class="card-with-buttons__heading">S\u00e3o Mateus - Juiz de Fora - MG</h2>
    <ul><li>70 m\u00b2</li><li>2 Quartos</li><li>1 Banheiro</li><li>1 Vaga</li></ul>
    <img class="cards_digital_carousel-image" src="https://img.kenlo.io/foto.jpg">
    ${cardMistoKenlo}</a>`;
  const imovel = await mapCardKenloLocacao(projeto, { href, html }, fields);
  assert.equal(Object.keys(imovel).length, 20);
  assert.equal(imovel.titulo, "Apartamento em Juiz de Fora");
  assert.equal(imovel.cidade, "juiz-de-fora-mg");
  assert.equal(imovel.bairro, "sao-mateus");
  assert.equal(imovel.tipoImovel, "apartamento");
  assert.equal(imovel.codigoBase, "AP5810-MOUY");
  assert.equal(imovel.preco, 1500.5);
  assert.equal(imovel.areaValor, 70);
  assert.equal(imovel.dormitorioValor, 2);
  assert.equal(imovel.banheiroValor, 1);
  assert.equal(imovel.garagemValor, 1);
  assert.equal(imovel.linkFoto, "https://img.kenlo.io/foto.jpg");
  assert.match(imovel.atualizadoEm, /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/);
  const anterior = { ...imovel, dataInclusao: "01/01/2020 00:00:00", atualizadoEm: "01/01/2020 00:00:00" };
  const { ativos } = reconciliarLocacao([imovel], [anterior], projeto.collection, { totalEsperado: 1 });
  assert.equal(ativos[0].dataInclusao, anterior.dataInclusao);
  assert.equal(ativos[0].atualizadoEm, imovel.atualizadoEm);
  assert.notEqual(ativos[0].atualizadoEm, anterior.atualizadoEm);
  await assert.rejects(mapCardKenloLocacao(projeto, { href, html: html.replace("S\u00e3o Mateus - Juiz de Fora - MG", "") }, fields), /Card sem titulo, cidade/);
});

test("executor grava apenas JSON de locacao e fecha navegador antes de exportar", async () => {
  calls.length = 0;
  await runProjetoKenlo("crispi");
  const count = calls.find(([name]) => name === "count")[1];
  assert.equal(count.projeto, "jfCrispi");
  assert.equal(count.url, projetosLocacaoKenlo.find(projeto => projeto.collection === "jfCrispi").url);
  assert.ok(calls.findIndex(([name]) => name === "count") < calls.findIndex(([name]) => name === "extract"));
  assert.match(calls.find(([name]) => name === "json")[1], /jfCrispiLocacao\.json$/);
  assert.deepEqual(calls.find(([name]) => name === "clear"), ["clear", SPREADSHEET_LOCACAO_KENLO, "jfCrispi"]);
  assert.ok(calls.findIndex(([name]) => name === "close") < calls.findIndex(([name]) => name === "json"));
});

test("falha da precontagem impede extracao e nao limpa nem a Multimoveis", async () => {
  countError = new Error("Sheets da contagem indisponivel");
  try {
    for (const projeto of ["crispi", "multimoveis"]) {
      calls.length = 0;
      await assert.rejects(runProjetoKenlo(projeto), /Sheets da contagem indisponivel/);
      assert.ok(calls.some(([name]) => name === "close"));
      assert.ok(!calls.some(([name]) => ["extract", "json", "clear", "rows"].includes(name)));
    }
  } finally { countError = null; }
});

test("vazio confirmado prepara [] e historico existente e preservado", async () => {
  calls.length = 0;
  result = { imoveisRaspados: [], semImoveisConfirmado: true };
  await runProjetoKenlo("crispi");
  assert.equal(calls.find(([name]) => name === "json")[2], "[]");
  assert.ok(calls.some(([name]) => name === "header"));
  existing = [{ linkReal: "https://example.com/imovel/retirado", preco: 850 }];
  calls.length = 0;
  await runProjetoKenlo("crispi");
  assert.ok(calls.some(([name]) => name === 'archive'));
  assert.ok(calls.some(([name]) => name === 'clear'));
});

test("vazio sem aviso nao publica nem altera arquivos", async () => {
  calls.length = 0;
  result = { imoveisRaspados: [], semImoveisConfirmado: false };
  await assert.rejects(runProjetoKenlo("crispi"), /nao confirmada/);
  assert.ok(!calls.some(([name]) => ["json", "clear", "rows"].includes(name)));
});

test("Multimoveis indisponivel retorna0 e zera JSON e Sheets conforme configuracao", async () => {
  calls.length=0;
  extractionError=Object.assign(new Error('HTTP503 manutencao'),{code:'LOCACAO_UNAVAILABLE'});
  try {
    assert.equal(await runProjetoKenlo('multimoveis'),0);
    assert.equal(calls.find(([name])=>name==='count')[1].zeroIfUnavailable,true);
    assert.match(calls.find(([name])=>name==='json')[1],/jfMultimoveisLocacao\.json$/);
    assert.equal(calls.find(([name])=>name==='json')[2],'[]');
    assert.deepEqual(calls.find(([name])=>name==='clear'),['clear',SPREADSHEET_LOCACAO_KENLO,'jfMultimoveis']);
    assert.ok(!calls.some(([name])=>name==='rows'));
  }finally{extractionError=null;}
});

test("falha de mapeamento com cards nao e mascarada como zero na Multimoveis",async()=>{
  calls.length=0;
  extractionError=new Error('Preco de card nao reconhecido');
  try {
    await assert.rejects(runProjetoKenlo('multimoveis'),/Preco de card/);
    assert.ok(!calls.some(([name])=>['json','clear','rows'].includes(name)));
  }finally{extractionError=null;}
});