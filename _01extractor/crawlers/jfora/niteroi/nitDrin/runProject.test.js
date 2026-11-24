import assert from "node:assert/strict";
import { mock, test } from "node:test";

const events = [];
let countOptions;
let extractionOptions;
let syncOptions;
let fail = false;
const records = [{ linkReal: "https://www.drinimoveis.com.br/imovel/teste/REF1", codigoBase: "REF1" }];
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
  extractDrinSales: async (_browser, options) => {
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
const { runDrin } = await import("./runProject.js");
const { NITEROI_SPREADSHEET_ID } = await import("../projects.js");

test("checks completo e simples nao gravam dados e sempre usam headless", async () => {
  for (const checkCompleto of [true, false]) {
    events.length = 0;
    assert.deepEqual(await runDrin({ check: true, checkCompleto }), records);
    assert.deepEqual(events, ["abrir", "contar", "raspar", "fechar"]);
    assert.equal(countOptions.salvar, false);
    assert.equal(extractionOptions.somentePrimeiraPagina, !checkCompleto);
  }
});

test("execucao normal conta antes da coleta e sincroniza com destino Niteroi", async () => {
  events.length = 0;
  await runDrin({ check: false, checkCompleto: false });
  assert.deepEqual(events, ["abrir", "contar", "raspar", "fechar", "salvar"]);
  assert.equal(countOptions.salvar, true);
  assert.equal(countOptions.spreadsheetId, NITEROI_SPREADSHEET_ID);
  assert.equal(syncOptions.spreadsheetId, NITEROI_SPREADSHEET_ID);
  assert.equal(syncOptions.imobiliaria, "nitDrin");
  assert.equal(syncOptions.totalEsperado, 1);
  assert.match(syncOptions.outputPath, /[\\/]crawler[\\/]nitDrin\.json$/);
});

test("falha de coleta fecha navegador e impede sincronizacao", async () => {
  events.length = 0;
  fail = true;
  try {
    await assert.rejects(runDrin({ check: false, checkCompleto: false }), /base preservada/);
    assert.deepEqual(events, ["abrir", "contar", "raspar", "fechar"]);
  } finally { fail = false; }
});
