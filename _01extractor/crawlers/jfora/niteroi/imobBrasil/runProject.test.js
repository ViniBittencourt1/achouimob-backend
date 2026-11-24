import assert from "node:assert/strict";
import { mock, test } from "node:test";

const launches = [];
const counts = [];
let closed = 0;
let blocked = false;
let saved = 0;
let countError;
mock.module("../../../../services/puppeteerPool.js", { namedExports: {
  abrirBrowser: async options => {
    launches.push(options);
    return { close: async () => { closed++; } };
  },
} });
mock.module("../../_utils/vendasContagem.js", { namedExports: {
  contarAntesDasVendas: async (_browser, options) => {
    counts.push(options);
    if (countError) throw countError;
    return 0;
  },
} });
mock.module("../../_utils/vendasSincronizacao.js", { namedExports: {
  sincronizarVendas: async () => { saved++; },
} });
mock.module("./extractor.js", { namedExports: {
  IMOBBRASIL_USER_AGENT: "Test Chrome",
  extractImobBrasilSales: async () => {
    if (blocked) throw Object.assign(new Error("Site bloqueado"), { code: "IMOBBRASIL_BLOCKED" });
    return [];
  },
  enriquecerNovosImobBrasil: async () => {},
} });
const { runNiteroiImobBrasil } = await import("./runProject.js");

test("nitOceanica identifica a contagem e nao abre fallback para site desativado", async () => {
  launches.length = 0;
  const previousClosed = closed;
  countError = Object.assign(new Error("Site temporariamente desativado"), { code: "IMOBBRASIL_UNAVAILABLE" });
  try {
    await assert.rejects(runNiteroiImobBrasil("nitOceanica", { check: true }), countError);
    assert.equal(counts.at(-1).userAgent, "Test Chrome");
    assert.equal(counts.at(-1).salvar, false);
    assert.equal(launches.length, 1);
    assert.equal(launches[0].headlessOverride, true);
    assert.equal(closed, previousClosed + 1);
    assert.equal(saved, 0);
  } finally { countError = undefined; }
});

test("nitNiteroi sempre headless, identifica contagem e nao salva no check", async () => {
  launches.length = 0;
  const previousClosed = closed;
  await runNiteroiImobBrasil("nitNiteroi", { check: true });
  assert.equal(launches.length, 1);
  assert.equal(launches[0].headlessOverride, true);
  assert.equal(counts.at(-1).userAgent, "Test Chrome");
  assert.equal(counts.at(-1).salvar, false);
  assert.equal(closed, previousClosed + 1);
  assert.equal(saved, 0);
});

test("bloqueio no nitNiteroi nao abre navegador visivel nem salva", async () => {
  launches.length = 0;
  const previousClosed = closed;
  blocked = true;
  try {
    await assert.rejects(runNiteroiImobBrasil("nitNiteroi", { check: true }), /Site bloqueado/);
    assert.equal(launches.length, 1);
    assert.equal(launches[0].headlessOverride, true);
    assert.equal(closed, previousClosed + 1);
    assert.equal(saved, 0);
  } finally { blocked = false; }
});
