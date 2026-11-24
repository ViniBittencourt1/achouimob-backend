import assert from "node:assert/strict";
import fs from "node:fs";
import { mock, test } from "node:test";
import { extractPreco } from "./extractor-03-preco.js";
import { extractTitulo } from "./extractor-02-titulo.js";
import { extractBairroFromCardHtml, extractBairroFromLinkReal } from "./extractor-06-bairrojs.js";
import { enrichImoveisWithInternalData } from "./extractor-00-rotaInterna.js";
import { extractBomClimaData } from "./extractor.js";

const card = '<span class="ImovelCardInfo_colorOfTitleCondominium__IfTu_">Apartamento</span><div class="ImovelCardInfo_priceRow__STnbH"><span class="ImovelCardInfo_priceValue__9wQx4">R$&nbsp;1.200,50</span><span>Aluguel</span></div><div class="ImovelCardInfo_feesRow__ERQFy"><span class="ImovelCardInfo_feesValue__Ln2hX">Condom\u00ednio R$&nbsp;50,00</span><span class="ImovelCardInfo_feesValue__Ln2hX">IPTU R$&nbsp;90,61</span></div>';
const calls = [];
let extracted = [{ linkReal: "https://www.bomclimaimoveisjf.com.br/imovel/apartamento/locacao/juiz-de-fora/mg/bandeirantes/AP0028_BCIMOB", titulo: "Apartamento", preco: 1200 }];
let countError = null;
mock.module("../_utils/locacaoContagem.js", {
  namedExports: { contarAntesDaLocacaoAcervo: async (_browser, options) => {
    calls.push(["count", options]);
    if (countError) throw countError;
    return 1;
  } },
});
mock.module("node:fs", { defaultExport: { ...fs, existsSync: () => false, mkdirSync: (...args) => calls.push(["mkdir", ...args]), writeFileSync: (...args) => calls.push(["json", ...args]) } });
mock.module("../../../services/puppeteerPool.js", { namedExports: { abrirBrowser: async () => ({ close: async () => calls.push(["close"]) }) } });
mock.module("./extractor.js", { namedExports: { extractBomClimaData: async (_browser, links, options) => { calls.push(["extract", links, options]); return extracted; } } });
mock.module("./extractor-00-rotaInterna.js", { namedExports: { enrichImoveisWithInternalData: async (_browser, _imoveis, options) => calls.push(["enrich", options]) } });
mock.module("../../../services/googleSheets.js", { namedExports: {ensureSheet: async (_id, title) => title, readSheet: async () => [],  clearSheet: async (...args) => calls.push(["clear", ...args]), writeHeader: async (...args) => calls.push(["header", ...args]), writeSheet: async (...args) => calls.push(["rows", ...args]) } });
const { main, destinoSheetsLocacao } = await import("./locacao.js");
const { exportToSheets } = await import("./sheets.js");

test("bairro ausente no HTML usa segmento depois da UF e antes do codigo", () => {
  const link = 'https://www.bomclimaimoveisjf.com.br/imovel/casa/locacao/juiz-de-fora/mg/parque-guarani/CA0032_BCIMOB';
  assert.equal(extractBairroFromCardHtml('<div>Sem breadcrumb</div>', 'juiz-de-fora-mg', link), 'parque-guarani');
  assert.equal(extractBairroFromLinkReal(link), 'parque-guarani');
  assert.equal(extractBairroFromLinkReal(link + '?from=rent#fotos', 'juiz-de-fora-mg'), 'parque-guarani');
  assert.equal(extractBairroFromLinkReal(link.replace('parque-guarani', 'bairro-inexistente'), 'juiz-de-fora-mg'), '');
  assert.equal(extractBairroFromLinkReal(link, 'cidade-inexistente-mg'), '');
  assert.equal(extractBairroFromLinkReal('link invalido'), '');
});

test("bairro do HTML da cidade correta permanece prioritario sem escolher Guarani de outra cidade", () => {
  const link = 'https://www.bomclimaimoveisjf.com.br/imovel/casa/locacao/juiz-de-fora/mg/parque-guarani/CA0032_BCIMOB';
  const breadcrumb = value => `<ul class="breadcrumb"><li></li><li></li><li><span itemprop="name">${value}</span></li></ul>`;
  assert.equal(extractBairroFromCardHtml(breadcrumb('Guarani'), 'juiz-de-fora-mg', link), 'parque-guarani');
  assert.equal(extractBairroFromCardHtml(breadcrumb('Guarani'), '', link), 'parque-guarani');
  assert.equal(extractBairroFromCardHtml(breadcrumb('Centro'), 'juiz-de-fora-mg', link), 'centro');
  assert.equal(extractBairroFromCardHtml(breadcrumb('Nao cadastrado'), 'juiz-de-fora-mg', link), 'parque-guarani');
});

test("rota interna usa cidade e link sem sobrescrever Parque Guarani por outra cidade", async () => {
  const imovel = {linkReal:'https://www.bomclimaimoveisjf.com.br/imovel/casa/locacao/juiz-de-fora/mg/parque-guarani/CA0032_BCIMOB',cidade:'juiz-de-fora-mg',bairro:'parque-guarani',linkFoto:'foto-listagem'};
  let closed = false;
  const timer = mock.method(globalThis,'setTimeout',callback=>{queueMicrotask(callback);return 0;});
  try {
    const browser = {newPage:async()=>({goto:async()=>{},content:async()=>'<div>Sem breadcrumb de bairro</div>',close:async()=>{closed=true;}})};
    await enrichImoveisWithInternalData(browser,[imovel],{preservarFotoListagem:true});
    assert.equal(imovel.bairro,'parque-guarani');
    assert.equal(imovel.cidade,'juiz-de-fora-mg');
    assert.equal(imovel.linkFoto,'foto-listagem');
    assert.equal(closed,true);
  } finally {timer.mock.restore();}
});

test("layout Acervo atual seleciona aluguel sem somar taxas", () => {
  assert.equal(extractPreco(card, "locacao"), 1200.5);
  assert.equal(extractTitulo(card, { incluirTaxas: true }), "Apartamento | Condom\u00ednio R$ 50,00 / IPTU R$ 90,61");
  assert.equal(extractTitulo(card), "Apartamento");
});

test("layout legado preserva venda e seleciona locacao em card misto", () => {
  const html = '<div class="d-flex flex-row justify-content-between text-truncate"><span>Venda</span><span>R$ 300.000,00</span></div><div class="d-flex flex-row justify-content-between text-truncate"><span>Aluguel</span><span>R$ 1.200,00</span></div>';
  assert.equal(extractPreco(html), 300000);
  assert.equal(extractPreco(html, "locacao"), 1200);
  assert.equal(extractPreco(html.replace("Aluguel", "Venda"), "locacao"), null);
});

test("JSON e planilha de locacao separados com aba herdada", async () => {
  await main();
  assert.deepEqual(calls.find(([name]) => name === "count")[1], { projeto: "jfBomClima", url: calls.find(([name]) => name === "extract")[1][0] });
  assert.ok(calls.findIndex(([name]) => name === "count") < calls.findIndex(([name]) => name === "extract"));
  assert.match(calls.find(([name]) => name === "json")[1], /jfBomClimaLocacao\.json$/);
  assert.deepEqual(calls.find(([name]) => name === "extract")[2], { negociacao: "locacao", incluirTaxas: true });
  assert.deepEqual(calls.find(([name]) => name === "clear"), ["clear", destinoSheetsLocacao.spreadsheetId, "jfBomClima"]);
  assert.equal(calls.find(([name]) => name === "header")[3].length, 21);
  assert.deepEqual(calls.find(([name]) => name === "enrich")[1], { preservarFotoListagem: true });
});

test("default de Sheets continua vendas", async () => {
  calls.length = 0;
  const previous = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY";
  try { await exportToSheets(extracted); assert.deepEqual(calls.find(([name]) => name === "clear"), ["clear", "1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY", "jfBomClima"]); }
  finally { if (previous === undefined) delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID; else process.env.GOOGLE_SHEETS_SPREADSHEET_ID = previous; }
});

test("falha da precontagem Bom Clima impede extracao e preserva dados", async () => {
  calls.length = 0;
  countError = new Error("Contagem indisponivel");
  try {
    await assert.rejects(main(), /Contagem indisponivel/);
    assert.ok(calls.some(([name]) => name === "close"));
    assert.ok(!calls.some(([name]) => ["extract", "enrich", "json", "clear", "rows"].includes(name)));
  } finally { countError = null; }
});

test('alugueis desabilitam cache antes de navegar e mantem rejeicao de erro HTTP', async () => {
  const events = [];
  const page = {
    setUserAgent: async () => {},
    setViewport: async () => {},
    setCacheEnabled: async enabled => events.push(['cache', enabled]),
    goto: async () => { events.push(['goto']); return { ok: () => false, status: () => 503 }; },
  };
  await assert.rejects(extractBomClimaData({ newPage: async () => page }, ['https://www.bomclimaimoveisjf.com.br/imoveis/para-alugar/brasil'], { negociacao: 'locacao' }), /HTTP 503/);
  assert.deepEqual(events, [['cache', false], ['goto']]);
});

test('vendas mantem o comportamento de cache existente', async () => {
  const page = {
    setUserAgent: async () => {},
    setViewport: async () => {},
    setCacheEnabled: async () => assert.fail('Nao alterar cache de vendas'),
    goto: async () => { throw new Error('Fim da navegacao simulada'); },
  };
  await assert.rejects(extractBomClimaData({ newPage: async () => page }, ['https://www.bomclimaimoveisjf.com.br/imoveis/a-venda/brasil']), /Fim da navegacao simulada/);
});

test("coleta vazia preserva JSON e planilha anteriores", async () => {
  calls.length = 0;
  extracted = [];
  await assert.rejects(main(), /Nenhum aluguel extraido/);
  assert.ok(!calls.some(([name]) => ["json", "clear", "rows"].includes(name)));
});