import assert from "node:assert/strict";
import fs from "node:fs";
import { mock, test } from "node:test";
import { mapImovelLiderLocacao, mapImovelLiderVendaSite, mapImovelLiderLocacaoSite, mapImovelLiderLocacaoImobBrasil, mapImovelLiderVendaImobBrasil, contarLiderLocacao } from "./extractor-locacao.js";
import { URL_LOCACAO_LIDER } from "./extractor-locacao.js";
import * as contagem from "../_utils/locacaoContagem.js";

const sample = {
  id: "fdbe6493-79ab-487f-b1f7-90cee9b502b0", codigo: "AP0432", titulo: "Apartamento no Bom Jardim", finalidade: "locacao",
  valor_locacao: 900, valor_venda: 300000, valor_condominio: 150, valor_iptu: 80,
  subtipo: "Apartamento", bairro: "Bom Jardim", cidade: "Juiz de Fora", estado: "MG",
  quartos: 2, banheiros: 1, vagas_garagem: 1, metragem_util: 70, salas: 1, capa_url: "https://example.com/foto.jpg",
};

const calls = [];
let countError = null;
mock.module("../_utils/locacaoContagem.js", {
  namedExports: { ...contagem, contarAntesDaLocacaoImobBrasil: async (_browser, options) => {
    calls.push(["count", options]);
    if (countError) throw countError;
    return 1;
  } },
});
mock.module("node:fs", {
  defaultExport: { ...fs, existsSync: () => false, mkdirSync: () => {}, writeFileSync: (...args) => calls.push(["json", ...args]) },
});
mock.module("../../../services/puppeteerPool.js", {
  namedExports: { abrirBrowser: async options => {
    calls.push(["browser", options]);
    return { close: async () => calls.push(["close"]) };
  } },
});
mock.module("./extractor-locacao.js", {
  namedExports: {
    URL_LOCACAO_LIDER,
    mapImovelLiderVendaSite,
    mapImovelLiderLocacaoSite,
    mapImovelLiderLocacaoImobBrasil,
    mapImovelLiderVendaImobBrasil,
    extractLiderLocacao: async (_browser, options) => { calls.push(["extract", options]); return [mapImovelLiderLocacao(sample)]; },
  },
});
mock.module("../../../services/googleSheets.js", {
  namedExports: {ensureSheet: async (_id, title) => title, readSheet: async () => [],
    clearSheet: async (...args) => calls.push(["clear", ...args]),
    writeHeader: async (...args) => calls.push(["header", ...args]),
    writeSheet: async (...args) => calls.push(["rows", ...args]),
  },
});
const { exportToSheets } = await import("./sheets.js");
const { main } = await import("./locacao.js");

test("mapeia 20 campos, aluguel sem taxas, codigo, foto e URL atual", () => {
  const result = mapImovelLiderLocacao(sample);
  assert.equal(Object.keys(result).length, 20);
  assert.equal(result.preco, 900);
  assert.equal(result.codigoBase, "AP0432");
  assert.equal(result.linkReal, `https://www.lidernegociosimob.com.br/p/${sample.id}`);
  assert.equal(result.areaValor, 70);
  assert.equal(result.dormitorioValor, 2);
  assert.ok(result.cidade);
  assert.equal(result.cidade, 'juiz-de-fora-mg');
  assert.equal(result.bairro, 'bom-jardim');
  assert.equal(result.tipoImovel,'apartamento');
  assert.equal(result.linkFoto, sample.capa_url);
});

test("bairro da API e convertido ao slug do catalogo da cidade, inclusive acentos e caixa", () => {
  assert.equal(mapImovelLiderLocacao({...sample,bairro:'Centro'}).bairro,'centro');
  assert.equal(mapImovelLiderLocacao({...sample,bairro:'SÃO MATEUS'}).bairro,'sao-mateus');
  assert.equal(mapImovelLiderLocacao({...sample,bairro:'bom-jardim'}).bairro,'bom-jardim');
  assert.equal(mapImovelLiderLocacao({...sample,bairro:'Nome realmente nao cadastrado'}).bairro,'Nome realmente nao cadastrado');
  assert.equal(mapImovelLiderLocacao({...sample,bairro:null}).bairro,'');
  assert.equal(mapImovelLiderLocacao({...sample,bairro:'Bom Jardim',cidade:'Cidade inexistente'}).bairro,'Bom Jardim');
});

test("tipo da API Lider vira slug do catalogo e pode usar tipo quando subtipo e generico",()=>{
  assert.equal(mapImovelLiderLocacao({...sample,subtipo:'Cobertura',tipo:'Apartamento'}).tipoImovel,'cobertura');
  assert.equal(mapImovelLiderLocacao({...sample,subtipo:'Cobertura Duplex',tipo:'Apartamento'}).tipoImovel,'cobertura');
  assert.equal(mapImovelLiderLocacao({...sample,subtipo:'Padrão',tipo:'Cobertura'}).tipoImovel,'cobertura');
  assert.equal(mapImovelLiderLocacao({...sample,subtipo:'Galpão'}).tipoImovel,'galpao');
  assert.equal(mapImovelLiderLocacao({...sample,subtipo:'Sobrado'}).tipoImovel,'casa');
  assert.equal(mapImovelLiderLocacao({...sample,subtipo:'Padrão',tipo:'Apartamento'}).tipoImovel,'apartamento');
  assert.equal(mapImovelLiderLocacao({...sample,subtipo:'Tipo desconhecido',tipo:''}).tipoImovel,'Tipo desconhecido');
});

test("tipo composto do Lider pesquisa aliases contidos e devolve o slug do catalogo",()=>{
  for (const [subtipo,slug] of [
    ['Apartamento Garden','apartamento'],
    ['Apartamento Duplex','apartamento'],
    ['Terreno Urbano','terreno'],
    ['Casa Comercial','casa-comercial'],
    ['Casa de Campo','granja'],
  ]) {
    assert.equal(mapImovelLiderLocacao({...sample,subtipo}).tipoImovel,slug,subtipo);
  }
});

test("nao usa venda como fallback, rejeita outro negocio e ID invalido", () => {
  assert.equal(mapImovelLiderLocacao({ ...sample, valor_locacao: null }).preco, null);
  assert.throws(() => mapImovelLiderLocacao({ ...sample, finalidade: "venda" }), /fora da finalidade/);
  assert.throws(() => mapImovelLiderLocacao({ ...sample, id: "" }), /ID valido/);
  assert.throws(() => mapImovelLiderLocacao({ ...sample, valor_locacao: "invalido" }), /Preco/);
});

test("detalhes acrescentam endereco e elevador", () => {
  const result = mapImovelLiderLocacao({ ...sample, endereco_completo: "Rua Exemplo, 10", comodidades: ["Elevador"] });
  assert.ok(result.localizacao.endsWith("Rua Exemplo, 10"));
  assert.equal(result.elevadorValor, 1);
});

test("finalidade ambos aceita apenas valor de locacao em anuncio misto", () => {
  assert.equal(mapImovelLiderLocacao({ ...sample, finalidade: "ambos", valor_locacao: 1000, valor_venda: 500000 }).preco, 1000);
});

test("precontagem Lider le contador ImobBrasil sem visitar detalhes", async () => {
  let requests = 0;
  let closed = false;
  const page = {
    evaluate: async () => false,
    setUserAgent: async () => {},
    goto: async url => { requests++; assert.equal(url, URL_LOCACAO_LIDER); return { ok: () => true }; },
    url: () => URL_LOCACAO_LIDER,
    content: async () => '<h1>Imoveis Disponiveis, Locacao</h1><p class="topsearch__total"><strong>28</strong> imoveis encontrados. Pagina 1</p>',
    close: async () => { closed = true; },
  };
  assert.equal(await contarLiderLocacao({ newPage: async () => page }), 28);
  assert.equal(requests, 1);
  assert.equal(closed, true);
});

test("precontagem Lider rejeita total invalido e fecha pagina", async () => {
  let closed = false;
  const page = {
    evaluate: async () => false,
    setUserAgent: async () => {},
    goto: async () => ({ ok: () => true }),
    url: () => URL_LOCACAO_LIDER,
    content: async () => '<h1>Imoveis Disponiveis, Locacao</h1><p class="topsearch__total"><strong>invalido</strong> imoveis encontrados</p>',
    close: async () => { closed = true; },
  };
  await assert.rejects(contarLiderLocacao({ newPage: async () => page }), /Total de alugueis nao identificado/);
  assert.equal(closed, true);
});

test("entrada individual Lider registra contagem antes da extracao", async () => {
  calls.length = 0;
  await main();
  assert.deepEqual(calls.find(([name]) => name === "count")[1], { projeto: "jfLider", url: URL_LOCACAO_LIDER });
  assert.ok(calls.findIndex(([name]) => name === "count") < calls.findIndex(([name]) => name === "extract"));
  assert.deepEqual(calls.find(([name]) => name === "extract")[1], { totalEsperado: 1 });
});

test("falha da precontagem Lider impede extracao e preserva dados", async () => {
  calls.length = 0;
  countError = new Error("Contagem indisponivel");
  try {
    await assert.rejects(main(), /Contagem indisponivel/);
    assert.ok(calls.some(([name]) => name === "close"));
    assert.ok(!calls.some(([name]) => ["extract", "json", "clear", "rows"].includes(name)));
  } finally { countError = null; }
});

for (const headless of [undefined, "false", "true"]) {
  test(`Lider permanece oculta inclusive em bloqueio com CRAWLER_HEADLESS=${headless}`, async () => {
    const previous = process.env.CRAWLER_HEADLESS;
    try {
      if (headless === undefined) delete process.env.CRAWLER_HEADLESS;
      else process.env.CRAWLER_HEADLESS = headless;
      calls.length = 0;
      await main();
      assert.deepEqual(calls.filter(([name]) => name === "browser"), [["browser", { headlessOverride: true }]]);
      calls.length = 0;
      countError = Object.assign(new Error("HTTP 403"), { code: "LIDER_BLOCKED" });
      await assert.rejects(main(), /HTTP 403/);
      assert.deepEqual(calls.filter(([name]) => name === "browser"), [["browser", { headlessOverride: true }]]);
      assert.equal(calls.filter(([name]) => name === "close").length, 1);
      assert.ok(!calls.some(([name]) => ["extract", "json", "clear", "rows"].includes(name)));
    } finally {
      countError = null;
      if (previous === undefined) delete process.env.CRAWLER_HEADLESS;
      else process.env.CRAWLER_HEADLESS = previous;
    }
  });
}

test("Sheets de locacao usa aba jfLider sem alterar padrao de vendas", async () => {
  calls.length = 0;
  const previous = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY";
  try {
    await exportToSheets([mapImovelLiderLocacao(sample)]);
    assert.deepEqual(calls.find(([name]) => name === "clear"), ["clear", "1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY", "jfLider"]);
    calls.length = 0;
    await exportToSheets([mapImovelLiderLocacao(sample)], { spreadsheetId: "planilha-alugueis", sheetName: "jfLider" });
    assert.deepEqual(calls.find(([name]) => name === "clear"), ["clear", "planilha-alugueis", "jfLider"]);
    assert.equal(calls.find(([name]) => name === "header")[3].length, 21);
    assert.equal(calls.find(([name]) => name === "rows")[3][0][2], 900);
  } finally {
    if (previous === undefined) delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    else process.env.GOOGLE_SHEETS_SPREADSHEET_ID = previous;
  }
});