import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import { arquivoPrincipalImoveis, arquivoPrincipalLocacao } from "../_utils/vendasSincronizacao.js";

const source = fs.readFileSync(new URL("./jfora.js", import.meta.url), "utf8");
const functions = source.slice(source.indexOf("function isDataExclusaoVazia("), source.indexOf("// Usa agregacao count()"));

test("resumo JSON calcula faixas para mais de 130 mil registros", () => {
  const start = source.indexOf("function parseNumericValue(");
  const end = source.indexOf('app.get("/api/firestore-summary"', start);
  const context = vm.createContext({
    loadCityCatalog: () => ({ options: [] }),
    loadBairroCatalog: () => ({ entries: [] }),
    tiposCatalogoPath: "tipos",
    fs: { readFileSync: () => JSON.stringify({ tiposPorSlug: {} }) },
    formatLabelFromSlug: String,
    formatCityNameFromSlug: String,
    records: Array.from({ length: 140000 }, (_, i) => ({ preco: i, dormitorioValor: null })),
  });
  vm.runInContext(source.slice(start, end), context);
  const result = vm.runInContext("summarizeFirestoreRecords(records, true)", context);
  assert.equal(result.total, 140000);
  assert.equal(result.ranges.preco.min, 0);
  assert.equal(result.ranges.preco.max, 139999);
  assert.equal(result.ranges.preco.count, 140000);
  assert.equal(result.ranges.dormitorioValor, null);
});
function summary(files) {
  const context = vm.createContext({
    path, backendRoot: "root", arquivoPrincipalImoveis, arquivoPrincipalLocacao,
    fs: {
      existsSync: () => true, readdirSync: () => Object.keys(files),
      readFileSync: file => files[path.basename(file)],
      statSync: () => ({ mtimeMs: 123456 }),
    },
  });
  vm.runInContext(functions, context);
  return vm.runInContext("getJsonTransferSummary()", context);
}

test("resumo considera todos os JSONs JF/Nit de ambas negociacoes, sem depender de transmissoes anteriores", () => {
  const data = summary({
    "jfSoares.json": JSON.stringify([{ linkReal: "venda", dataExclusao: "" }]),
    "nitJnLocacao.json": JSON.stringify([{ linkReal: "ativo", dataExclusao: "0" }, { linkReal: "retirado", dataExclusao: "2026-10-01" }]),
    "nitNiteroi.json": "[]",
    "jfSoaresLocacaoRetirados.json": JSON.stringify([{ linkReal: "ignorar" }]),
    "config.json": "{}",
  });
  assert.equal(data.projects.length, 3);
  assert.equal(data.records, 2);
  assert.equal(data.excluidos, 1);
  assert.equal(data.porTipo.venda.projects, 2);
  assert.equal(data.porTipo.aluguel.records, 1);
});

test("JSON corrompido ou nao array falha explicitamente sem mostrar resumo parcial", () => {
  for (const invalid of ["{", "{}"]) assert.throws(() => summary({ "nitJn.json": invalid }));
});

test("Firestore conta vendas e alugueis atuais e backups sem usar estado local como total de projetos", async () => {
  const counts = { __imoveisPublicos: 10, __alugueisPublicos: 4, __imoveisPublicos__backup: 8, __alugueisPublicos__backup: 3 };
  const context = vm.createContext({
    loadFirestoreTransferState: () => ({ collections: { antigo: {} } }),
    ensureFirestore: () => ({ collection: name => ({ name, count: () => ({ get: async () => ({ data: () => ({ count: counts[name] }) }) }) }) }),
    latestReplicatedAt: async () => "2026-10-19",
  });

  const start = source.indexOf("async function getFirestoreTransferSummary(");
  vm.runInContext(source.slice(start, source.indexOf("function loadPackageJson(", start)), context);
  const data = await vm.runInContext("getFirestoreTransferSummary()", context);
  assert.equal(data.current.records, 14);
  assert.equal(data.backup.records, 11);
  assert.equal(data.current.porTipo.aluguel.records, 4);
  assert.equal(data.current.projects, null);
});

test("resumo de transferencia e local e nao consulta Firestore nem quando nao existe cache", async () => {
  let handler;
  const context = vm.createContext({
    getJsonTransferSummary: () => ({ projects: [{}, {}], records: 20, excluidos: 0 }),
    firestorePanelCache: { get: () => null },
    getFirestoreTransferSummary: async () => assert.fail("Nao consultar nuvem"),
  });
  const start = source.indexOf("function firestoreTransferSummaryResponse(");
  vm.runInContext(source.slice(start, source.indexOf('app.get("/api/firestore-transfer-summary"', start)), context);
  handler = vm.runInContext("firestoreTransferSummaryResponse", context);
  let response;
  handler({}, { json: data => { response = data; } });
  assert.equal(response.ok, true);
  assert.equal(response.json.projects, 2);
  assert.equal(response.json.records, 20);
  assert.equal(response.firestore, undefined);
  assert.match(response.firestoreError, /cache/);
});

test("painel renderiza modalidades e diferenca, mas nao mostra zero remoto quando consulta falha", async () => {
  const html = fs.readFileSync(new URL("./painel.html", import.meta.url), "utf8");
  const start = html.indexOf("async function loadFirestoreTransferSummary()");
  const end = html.indexOf('btnFirestoreSummary.addEventListener', start);
  for (const ok of [true, false]) {
    const element = { innerHTML: "" };
    const summary = { records: 20, projects: 2, excluidos: 0, porTipo: { venda: { records: 15 }, aluguel: { records: 5 } } };
    const context = vm.createContext({
      firestoreTransferSummary: element,
      fetch: async () => ({ ok, json: async () => ({
        json: summary, error: ok ? undefined : "cota esgotada",
        firestore: ok ? { current: summary, backup: summary } : undefined,
      }) }),
      formatNumber: String, formatTransferDate: () => "", escapeHtml: String,
    });

    vm.runInContext(html.slice(start, end), context);
    if (ok) {
      await vm.runInContext("loadFirestoreTransferSummary()", context);
      assert.match(element.innerHTML, /Comparação de quantidades/);
      assert.match(element.innerHTML, /Diferença/);
    } else {
      await assert.rejects(vm.runInContext("loadFirestoreTransferSummary()", context), /cota/);
      assert.match(element.innerHTML, /Indisponível: cota esgotada/);
      assert.ok(!element.innerHTML.includes("Registros publicados"));
    }
    assert.match(element.innerHTML, /Vendas: <strong>15/);
    assert.match(element.innerHTML, /Aluguéis: <strong>5/);
  }
});

test("resumos de Firestore e Typesense usam snapshot e nao varrem a nuvem em GET", () => {
  const functions = [
    source.slice(source.indexOf('app.get("/api/firestore-summary"'), source.indexOf('app.post("/api/firestore-summary/refresh"')),
    source.slice(source.indexOf('app.get("/api/typesense-source-info"'), source.indexOf('app.post("/api/check-missing-city-slugs"')),
  ];
  for (const body of functions) {
    assert.ok(!body.includes("ensureFirestore("));
    assert.ok(!body.includes('.collection("__imoveisPublicos").get()'));
  }
});

test("correcoes locais nunca publicam, mesmo com FIRESTORE_PUBLISH_JSON true", async () => {
  const context = vm.createContext({
    process: { env: { FIRESTORE_PUBLISH_JSON: "true" } },
    ensureFirestore: () => assert.fail("Nao consultar nuvem"),
    emitLog: () => {},
  });
  const start = source.indexOf("async function updateFirestoreFromJsonCorrection(");
  vm.runInContext(source.slice(start, source.indexOf("function loadCityJsonCorrections(", start)), context);
  const result = await vm.runInContext('updateFirestoreFromJsonCorrection({ file: "jfSoares.json", linkReal: "https://example.com", patch: { preco: 3 }, scopeLabel: "TEST" })', context);
  assert.equal(result.localOnly, true);
  assert.equal(result.publicUpdated, 0);
  for (const [startMarker, endMarker] of [
    ['app.put("/api/filters/cities/:index"', 'app.get("/api/filters/bairros"'],
    ['app.put("/api/filters/bairros/:index"', 'app.get("/api/filters/tipos"'],
    ['app.put("/api/filters/tipos/:slug/:aliasIndex"', "function getCollectionNameFromCrawlerFile("],
    ['app.post("/api/bairro-catalog-issues/:index/resolve"', 'app.post("/api/city-slug-issues/'],
  ]) {
    const handler = source.slice(source.indexOf(startMarker), source.indexOf(endMarker, source.indexOf(startMarker)));
    assert.ok(handler.length > 0, startMarker);
    assert.ok(!handler.includes("ensureFirestore("), startMarker);
    assert.ok(!handler.includes("enqueueManualSync("), startMarker);
  }
});

test("leitura completa exige confirmacao antes de SDK e endpoints legados sao bloqueados", async () => {
  let handler;
  const start = source.indexOf('app.post("/api/firestore-summary/refresh"');
  const context = vm.createContext({
    app: { post: (_route, callback) => { handler = callback; } },
    firestorePanelCache: { refresh: () => assert.fail("Nao ler sem confirmar") },
  });
  vm.runInContext(source.slice(start, source.indexOf("function firestoreTransferSummaryResponse(", start)), context);
  let status;
  await handler({ body: {} }, { status: code => { status = code; return { json: data => assert.match(data.error, /leitura completa/) }; } });
  assert.equal(status, 400);
  assert.match(source, /Validacao remota legada desativada/);
});
