import assert from "node:assert/strict";
import { mock, test } from "node:test";

const events = [];
let extractionOptions;
let countOptions;
let syncOptions;
let fail = false;
const records = [{ linkReal: "https://sicilianoimoveis.com.br/apartamento-teste", codigoBase: "TESTE" }];
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
  extractSicilianoSales: async (_browser, options) => {
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
const { runSiciliano } = await import("./runProject.js");
const { NITEROI_SPREADSHEET_ID } = await import("../projects.js");

test("check completo nao grava contagem, JSON ou Sheets e nao abre janela", async () => {
  events.length = 0;
  assert.deepEqual(await runSiciliano({ checkCompleto: true }), records);
  assert.deepEqual(events, ["abrir", "contar", "raspar", "fechar"]);
  assert.equal(countOptions.salvar, false);
  assert.equal(extractionOptions.somentePrimeiraPagina, false);
});

test("check simples valida apenas primeiro lote sem gravacao", async () => {
  events.length = 0;
  await runSiciliano({ check: true, checkCompleto: false });
  assert.equal(countOptions.salvar, false);
  assert.equal(extractionOptions.somentePrimeiraPagina, true);
  assert.ok(!events.includes("salvar"));
});

test("execucao normal conta, coleta e sincroniza com destino Niteroi", async () => {
  events.length = 0;
  await runSiciliano({ check: false, checkCompleto: false });
  assert.deepEqual(events, ["abrir", "contar", "raspar", "fechar", "salvar"]);
  assert.equal(countOptions.salvar, true);
  assert.equal(countOptions.spreadsheetId, NITEROI_SPREADSHEET_ID);
  assert.equal(syncOptions.spreadsheetId, NITEROI_SPREADSHEET_ID);
  assert.equal(syncOptions.imobiliaria, "nitSiciliano");
  assert.equal(syncOptions.totalEsperado, 1);
  assert.match(syncOptions.outputPath, /[\\/]crawler[\\/]nitSiciliano\.json$/);
  const consolidados = [...syncOptions.consolidados.values()].map(item => item.linkReal);
  for (const record of records) assert.ok(consolidados.includes(record.linkReal));
});

test("falha de coleta fecha navegador e impede sincronizacao", async () => {
  events.length = 0;
  fail = true;
  try {
    await assert.rejects(runSiciliano({ check: false, checkCompleto: false }), /base preservada/);
    assert.deepEqual(events, ["abrir", "contar", "raspar", "fechar"]);
  } finally { fail = false; }
});
