import assert from "node:assert/strict";
import { mock, test } from "node:test";

let counts;
let failures;
let events;
let syncOptions;
let collectionNumber;
const changed = () => Object.assign(new Error("Total mudou; coleta parcial nao sera salva."), { code: "KENLO_TOTAL_ALTERADO" });
mock.module("../../../services/puppeteerPool.js", { namedExports: {
  abrirBrowser: async () => ({ close: async () => events.push("fechar") }),
} });
mock.module("../../../services/crawlerJson.js", { namedExports: {
  getCollectionAsMap: async () => new Map(),
} });
mock.module("../_utils/vendasContagem.js", { namedExports: {
  contarAntesDasVendas: async (_browser, options) => {
    events.push(options.salvar === false ? "conferir" : "contar");
    assert.ok(counts.length, "Contagem inesperada");
    return counts.shift();
  },
} });
mock.module("./extractor.js", { namedExports: {
  extractNiteroiSales: async (_browser, options) => {
    events.push("raspar");
    const error = failures.shift();
    if (error) throw error;
    collectionNumber++;
    return Array.from({ length: options.totalEsperado }, (_, index) => ({ linkReal: `https://example.com/${collectionNumber}/${index}` }));
  },
} });
mock.module("./parser.js", { namedExports: {
  consolidateData: records => records,
} });
mock.module("./sheets.js", { namedExports: { exportToSheets: async () => {} } });
mock.module("../_utils/vendasSincronizacao.js", { namedExports: {
  sincronizarVendas: async options => { events.push("salvar"); syncOptions = options; },
} });
const { runNiteroiProject } = await import("./runProject.js");
const run = (projectName = "nitNova") => runNiteroiProject({ projectName, displayName: projectName, baseUrl: "https://example.com/imoveis/a-venda" });
function reset(totals, errors = []) {
  counts = [...totals];
  failures = [...errors];
  events = [];
  syncOptions = undefined;
  collectionNumber = 0;
}

for (const projectName of ["nitNova", "nitAmin", "nitTeto", "nitFlora"]) {
test(`${projectName} descarta tentativa com total alterado e salva somente nova coleta completa`, async () => {
  reset([3, 2, 2], [changed()]);
  await run(projectName);
  assert.deepEqual(events, ["contar", "raspar", "contar", "raspar", "conferir", "fechar", "salvar"]);
  assert.equal(syncOptions.totalEsperado, 2);
  assert.equal(syncOptions.imoveisRaspados.length, 2);
});

test(`${projectName} reinicia se o total mudar na conferencia final sem unir tentativas`, async () => {
  reset([2, 3, 3, 3]);
  await run(projectName);
  assert.deepEqual(events, ["contar", "raspar", "conferir", "contar", "raspar", "conferir", "fechar", "salvar"]);
  assert.equal(syncOptions.totalEsperado, 3);
  assert.equal(syncOptions.imoveisRaspados.length, 3);
  assert.ok(syncOptions.imoveisRaspados.every(item => item.linkReal.includes("/2/")));
});

test(`${projectName} limita instabilidade a tres tentativas e nao salva nada`, async () => {
  reset([2, 2, 2], [changed(), changed(), changed()]);
  await assert.rejects(run(projectName), /Total mudou/);
  assert.equal(events.filter(event => event === "raspar").length, 3);
  assert.equal(events.at(-1), "fechar");
  assert.equal(syncOptions, undefined);
});

test(`${projectName} nao repete outros erros nem salva coleta incompleta`, async () => {
  reset([2], [new Error("Coleta incompleta")]);
  await assert.rejects(run(projectName), /Coleta incompleta/);
  assert.deepEqual(events, ["contar", "raspar", "fechar"]);
  assert.equal(syncOptions, undefined);
});

test(`${projectName} reconta divergencia global e reinicia somente quando o catalogo mudou`, async () => {
  const mismatch = Object.assign(new Error("Coleta difere da precontagem"), { code: "KENLO_TOTAL_DIVERGENTE" });
  reset([3, 2, 2, 2], [mismatch]);
  await run(projectName);
  assert.deepEqual(events, ["contar", "raspar", "conferir", "contar", "raspar", "conferir", "fechar", "salvar"]);
  assert.equal(syncOptions.totalEsperado, 2);
  assert.equal(syncOptions.imoveisRaspados.length, 2);

  reset([3, 3], [mismatch]);
  await assert.rejects(run(projectName), error => error === mismatch);
  assert.deepEqual(events, ["contar", "raspar", "conferir", "fechar"]);
  assert.equal(syncOptions, undefined);
});

test(`${projectName} limita reinicios por divergencia global a tres tentativas`, async () => {
  const mismatch = () => Object.assign(new Error("Coleta difere da precontagem"), { code: "KENLO_TOTAL_DIVERGENTE" });
  reset([4, 3, 3, 2, 2, 1], [mismatch(), mismatch(), mismatch()]);
  await assert.rejects(run(projectName), error => error.code === "KENLO_TOTAL_ALTERADO");
  assert.equal(events.filter(event => event === "raspar").length, 3);
  assert.equal(events.at(-1), "fechar");
  assert.equal(syncOptions, undefined);
});
}

test("demais projetos conservam uma tentativa e nao fazem nova contagem final", async () => {
  reset([1]);
  await run("nitLopes");
  assert.deepEqual(events, ["contar", "raspar", "fechar", "salvar"]);
  reset([1], [changed()]);
  await assert.rejects(run("nitLopes"), /Total mudou/);
  assert.deepEqual(events, ["contar", "raspar", "fechar"]);
  assert.equal(syncOptions, undefined);
});
