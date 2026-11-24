import assert from "node:assert/strict";
import { mock, test } from "node:test";

const events = [];
let countOptions;
let extractionOptions;
let syncOptions;
let fail = false;
let incomplete = false;
const rows = [{ linkReal: "https://www.corretorgustavoferreira.com.br/1/imoveis/venda-apartamento", codigoBase: "1" }];
mock.module("../../../../services/puppeteerPool.js", { namedExports: {
  abrirBrowser: async options => {
    assert.equal(options.headlessOverride, true);
    events.push("abrir");
    return { close: async () => events.push("fechar") };
  },
} });
mock.module("../../_utils/vendasContagem.js", { namedExports: {
  contarAntesDasVendas: async (_browser, options) => {
    countOptions = options;
    events.push("contar");
    return 3;
  },
} });
mock.module("./extractor.js", { namedExports: {
  extractGustavoSales: async (_browser, options) => {
    extractionOptions = options;
    events.push("raspar");
    if (fail) throw new Error("Coleta incompleta; base preservada.");
    return { imoveis: rows, excluidosLocacao: ["locacao"], excluidosVendidos: incomplete ? [] : ["vendido"] };
  },
} });
mock.module("../../_utils/vendasSincronizacao.js", { namedExports: {
  sincronizarVendas: async options => {
    syncOptions = options;
    events.push("salvar");
    return { ativos: options.imoveisRaspados };
  },
} });
const { runGustavo } = await import("./runProject.js");
const { NITEROI_SPREADSHEET_ID } = await import("../projects.js");

test("check completo e simples nao gravam dados e sempre usam headless", async () => {
  for (const checkCompleto of [true, false]) {
    events.length = 0;
    const result = await runGustavo({ check: true, checkCompleto });
    assert.deepEqual(result.imoveis, rows);
    assert.deepEqual(events, ["abrir", "contar", "raspar", "fechar"]);
    assert.equal(countOptions.salvar, false);
    assert.equal(extractionOptions.somentePrimeiraPagina, !checkCompleto);
  }
});

test("execucao normal valida contagem descontando excluidos e sincroniza na planilha Niteroi", async () => {
  events.length = 0;
  await runGustavo({ check: false, checkCompleto: false });
  assert.deepEqual(events, ["abrir", "contar", "raspar", "fechar", "salvar"]);
  assert.equal(countOptions.salvar, true);
  assert.equal(countOptions.spreadsheetId, NITEROI_SPREADSHEET_ID);
  assert.equal(syncOptions.totalEsperado, 1);
  assert.equal(syncOptions.spreadsheetId, NITEROI_SPREADSHEET_ID);
  assert.equal(syncOptions.imobiliaria, "nitGustavo");
  assert.match(syncOptions.outputPath, /[\\/]crawler[\\/]nitGustavo\.json$/);
});

test("erro na coleta ou contagem apos exclusoes impede salvamento e fecha navegador", async () => {
  for (const scenario of ["falha", "incompleto"]) {
    events.length = 0;
    fail = scenario === "falha";
    incomplete = scenario === "incompleto";
    try {
      await assert.rejects(runGustavo({ check: false, checkCompleto: false }), /base preservada/);
      assert.deepEqual(events, ["abrir", "contar", "raspar", "fechar"]);
    } finally { fail = false; incomplete = false; }
  }
});
