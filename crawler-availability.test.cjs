const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const {
  routeForScript, loadAvailability, isUnavailable, siteIsUnavailable,
  filterAvailableDocuments, removeUnavailableFromTypesense, updateAvailability,
} = require("./crawler-availability.cjs");
const { emailReport, reportHtml } = require("./crawler-report.cjs");

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "crawler-availability-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { directory, file: path.join(directory, "availability.json") };
}

test("mapeia vendas e alugueis de todas as cidades sem confundir utilitarios", () => {
  for (const [script, collection] of [["rv", "jfRVNegocios"], ["1000imoveis", "jf1000Imoveis"], ["nitpredial", "nitPredial"], ["ubaremax", "ubaRemax"], ["riometropole", "rioMetropole"]]) {
    assert.deepEqual(routeForScript(script), { collection, tipo: "vendas" });
    assert.deepEqual(routeForScript(`${script}:locacao`), { collection, tipo: "alugueis" });
  }
  assert.equal(routeForScript("typesense:sync"), null);
});

test("classifica site fora do ar sem ocultar erro de extracao, bloqueio, timeout ocioso ou retry recuperado", () => {
  for (const outputTail of ["HTTP 503 na busca; base preservada", "net::ERR_NAME_NOT_RESOLVED", "Site temporariamente desativado", "Error: getaddrinfo ENOTFOUND example.test"]) {
    assert.equal(siteIsUnavailable({ status: "failed", outputTail }), true);
  }
  for (const outputTail of ["HTTP 403", "HTTP 429", "Coleta incompleta: 10/20", "Node is either not clickable", "Total mudou durante a paginacao", "Waiting failed: 30000ms exceeded"]) {
    assert.equal(siteIsUnavailable({ status: "failed", outputTail }), false);
  }
  assert.equal(siteIsUnavailable({ status: "timeout", error: "Sem saida no log por 20 minutos" }), false);
  assert.equal(siteIsUnavailable({ status: "completed", outputTail: "HTTP 503; nova tentativa\nColeta 20/20 concluida" }), false);
  assert.equal(siteIsUnavailable({ status: "completed", outputTail: "HTTP 503; dados anteriores preservados" }), true);
  assert.equal(siteIsUnavailable({ status: "completed", outputTail: "Site esta temporariamente indisponivel." }), true);
});

test("suspende somente modalidade afetada, preserva JSON, persiste bloqueio e libera ao recuperar", async t => {
  const { directory, file } = fixture(t);
  const source = path.join(directory, "rioMetropole.json");
  fs.writeFileSync(source, '[{"linkReal":"https://example.test/1"}]');
  const original = fs.readFileSync(source, "utf8");
  const removed = [];
  const options = { file, remove: async (...args) => removed.push(args) };
  const result = await updateAvailability("riometropole", { status: "failed", outputTail: "HTTP 503 na listagem" }, options);
  assert.equal(result.siteUnavailable, true);
  assert.deepEqual(removed, [["rioMetropole", "vendas"]]);
  const state = loadAvailability(file);
  assert.equal(isUnavailable("rioMetropole", "vendas", state), true);
  assert.equal(isUnavailable("rioMetropole", "alugueis", state), false);
  assert.equal(fs.readFileSync(source, "utf8"), original);
  const docs = [{ id: "1", data: { imobiliariaId: "rioMetropole" } }, { id: "2", data: { imobiliariaId: "nitPredial" } }];
  assert.deepEqual(filterAvailableDocuments(docs, "vendas", state), [docs[1]]);
  assert.equal(filterAvailableDocuments(docs, "alugueis", state).length, 2);
  assert.equal(filterAvailableDocuments(docs.map(doc => ({ id: doc.id, ...doc.data })), "vendas", state).length, 1);
  assert.equal((await updateAvailability("riometropole", { status: "completed", outputTail: "Nenhum imovel extraido; base preservada" }, options)).siteUnavailable, true);
  assert.equal((await updateAvailability("riometropole", { status: "completed", outputTail: "466/466 sincronizados" }, options)).siteUnavailable, false);
  assert.equal(isUnavailable("rioMetropole", "vendas", loadAvailability(file)), false);
});

test("falha na retirada nunca fica escondida nem perde bloqueio persistente; tenta novamente", async t => {
  const { file } = fixture(t);
  const failed = await updateAvailability("nitpredial:locacao", { status: "failed", error: "HTTP 503" }, {
    file, remove: async () => { throw new Error("conexao Typesense indisponivel"); },
  });
  assert.equal(failed.siteUnavailable, true);
  assert.match(failed.publicationError, /Falha ao retirar/);
  assert.equal(isUnavailable("nitPredial", "alugueis", loadAvailability(file)), true);
  const report = { projects: [{ ...failed, script: "nitpredial:locacao" }] };
  assert.match(reportHtml(report), /Falha ao retirar/);
  let calls = 0;
  await updateAvailability("nitpredial:locacao", { status: "timeout" }, { file, remove: async () => { calls++; } });
  assert.equal(calls, 1);
});

test("email omite site indisponivel do HTML, totais e anexo JSON sem alterar diagnostico local", () => {
  const report = { projects: [
    { script: "riometropole", status: "failed", siteUnavailable: true, outputTail: "diagnostico oculto" },
    { script: "nitpredial", status: "completed" },
  ] };
  const original = JSON.stringify(report);
  const email = emailReport(report);
  assert.equal(email.projects.length, 1);
  assert.doesNotMatch(JSON.stringify(email), /riometropole|diagnostico oculto/);
  const html = reportHtml(report);
  assert.doesNotMatch(html, /riometropole|diagnostico oculto/);
  assert.match(html, /Total: 1/);
  assert.match(html, /Falhas: 0/);
  assert.equal(JSON.stringify(report), original);
});

test("runner envia anexos filtrados em memoria, nunca o JSON de diagnostico completo", async t => {
  const { directory } = fixture(t);
  const reportFile = path.join(directory, "report.json");
  fs.writeFileSync(reportFile, JSON.stringify({ projects: [
    { script: "riometropole", status: "failed", siteUnavailable: true, error: "diagnostico oculto" },
    { script: "nitpredial", status: "completed" },
  ] }));
  const source = fs.readFileSync(path.join(__dirname, "crawler-runner.cjs"), "utf8");
  const start = source.indexOf("async function sendEmail(");
  const end = source.indexOf("async function runCrawlers(", start);
  let sent;
  const context = {
    fs, path, reportFile, reportHtml, emailReport, emailFrom: "from@example.test", emailTo: "to@example.test",
    transporter: { sendMail: async data => { sent = data; } }, log() {},
  };
  vm.createContext(context);
  await vm.runInContext(`${source.slice(start, end)}\nsendEmail("Relatorio", reportHtml(JSON.parse(fs.readFileSync(reportFile, "utf8"))));`, context);
  assert.equal(sent.attachments.length, 2);
  assert.doesNotMatch(JSON.stringify(sent), /riometropole|diagnostico oculto/);
  assert.ok(sent.attachments.every(item => !item.path && item.content));
  assert.match(fs.readFileSync(reportFile, "utf8"), /diagnostico oculto/);
});

test("retira apenas documentos da imobiliaria e perfil certos e confirma exclusao", async () => {
  const calls = [];
  const client = { collections: name => ({
    documents: () => ({
      delete: async query => { calls.push([name, query]); return { num_deleted: 10 }; },
      search: async query => { assert.equal(query.filter_by, "imobiliariaId:=rioMetropole"); return { found: 0 }; },
    }),
  }) };
  assert.deepEqual(await removeUnavailableFromTypesense("rioMetropole", "alugueis", { client }), { num_deleted: 10 });
  assert.deepEqual(calls, [["imoveis_alugueis", { filter_by: "imobiliariaId:=rioMetropole" }]]);
  await assert.rejects(removeUnavailableFromTypesense("rioMetropole", "vendas", { env: {} }), /nao configurado/);
  const stale = { collections: () => ({ documents: () => ({
    delete: async () => ({ num_deleted: 0 }), search: async () => ({ found: 1 }),
  }) }) };
  await assert.rejects(removeUnavailableFromTypesense("rioMetropole", "vendas", { client: stale }), /ainda contem/);
  const missing = { collections: () => ({ documents: () => ({
    delete: async () => { throw Object.assign(new Error("not found"), { httpStatus: 404 }); },
  }) }) };
  assert.deepEqual(await removeUnavailableFromTypesense("rioMetropole", "vendas", { client: missing }), { num_deleted: 0 });
});

test("estado malformado bloqueia publicacao e nao e interpretado como todos disponiveis", t => {
  const { file } = fixture(t);
  for (const content of ["{", "[]", '{"x":null}', '{"x":{"collection":"rioMetropole","tipo":"errado","unavailable":true}}']) {
    fs.writeFileSync(file, content);
    assert.throws(() => loadAvailability(file), /invalido/);
  }
});

test("lote mantem site fora do email, tenta a cada rodada e so retoma checkpoint apos recuperar", async t => {
  const { directory, file } = fixture(t);
  const { runBatch } = await import("./render-daily.js");
  const options = {
    scripts: ["riometropole"], prepare() {},
    progressFile: path.join(directory, "progress.json"),
    reportPath: path.join(directory, "report.json"),
    availabilityFile: file,
    updateSite: (script, result, args) => updateAvailability(script, result, { ...args, remove: async () => {} }),
  };
  let calls = 0;
  const failed = await runBatch({ ...options, run: async () => { calls++; return { status: "failed", outputTail: "HTTP 503" }; } });
  assert.equal(failed.report.projects[0].siteUnavailable, true);
  assert.doesNotMatch(reportHtml(failed.report), /riometropole/);
  const recovered = await runBatch({ ...options, run: async () => { calls++; return { status: "completed" }; } });
  assert.equal(recovered.success, true);
  assert.equal(calls, 2);
  assert.match(reportHtml(recovered.report), /riometropole/);
  await updateAvailability("riometropole", { status: "failed", outputTail: "HTTP 503" }, { file, remove: async () => {} });
  const retry = await runBatch({ ...options, run: async () => { calls++; return { status: "completed" }; } });
  assert.equal(calls, 3, "suspensao invalida checkpoint de sucesso anterior do mesmo dia");
  assert.equal(retry.report.projects[0].status, "completed");
});
