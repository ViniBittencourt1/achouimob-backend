import assert from "node:assert/strict";
import { mock, test } from "node:test";

const events = [];
let countOptions;
let extractionOptions;
let syncOptions;
let fail = false;
const records = [{ linkReal: "https://www.remax.com.br/pt-br/imoveis/apartamento/venda/niteroi/631521015-1", codigoBase: "631521015-1" }];
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
    return 1;
  },
} });
mock.module("./extractor.js", { namedExports: {
  extractNiteroiRemaxSales: async (_browser, options) => {
    extractionOptions = options;
    events.push("raspar");
    if (fail) throw new Error("Coleta incompleta; base preservada.");
    return records;
  },
} });
mock.module("../../_utils/vendasSincronizacao.js", { namedExports: {
  sincronizarVendas: async options => {
    syncOptions = options;
    events.push("salvar");
    return { ativos: options.imoveisRaspados };
  },
} });
const { runNiteroiRemax } = await import("./runProject.js");
const { NITEROI_SPREADSHEET_ID } = await import("../projects.js");

test("checks completo e simples nao gravam dados e sempre usam headless", async () => {
  for (const checkCompleto of [true, false]) {
    events.length = 0;
    assert.deepEqual(await runNiteroiRemax({ check: true, checkCompleto }), records);
    assert.deepEqual(events, ["abrir", "contar", "raspar", "fechar"]);
    assert.equal(countOptions.salvar, false);
    assert.equal(extractionOptions.somentePrimeiraPagina, !checkCompleto);
    assert.ok(extractionOptions.existingDataMap instanceof Map);
  }
});

test("execucao normal sincroniza JSON proprio na planilha de Niteroi", async () => {
  events.length = 0;
  await runNiteroiRemax({ check: false, checkCompleto: false });
  assert.deepEqual(events, ["abrir", "contar", "raspar", "fechar", "salvar"]);
  assert.equal(countOptions.salvar, true);
  assert.equal(countOptions.projeto, "nitRemax");
  assert.equal(countOptions.spreadsheetId, NITEROI_SPREADSHEET_ID);
  assert.equal(syncOptions.spreadsheetId, NITEROI_SPREADSHEET_ID);
  assert.equal(syncOptions.imobiliaria, "nitRemax");
  assert.equal(syncOptions.totalEsperado, 1);
  assert.match(syncOptions.outputPath, /[\\/]crawler[\\/]nitRemax\.json$/);
});

test("falha fecha navegador e impede sincronizacao", async () => {
  events.length = 0;
  fail = true;
  try {
    await assert.rejects(runNiteroiRemax({ check: false, checkCompleto: false }), /base preservada/);
    assert.deepEqual(events, ["abrir", "contar", "raspar", "fechar"]);
  } finally { fail = false; }
});
