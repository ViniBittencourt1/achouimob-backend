const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { spawnSync } = require("node:child_process");
const { executeScript, getIdleTimeout } = require("./crawler-execution.cjs");
const { reportHtml } = require("./crawler-report.cjs");

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "crawler-execution-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("HTML do email omite apenas linhas sem crawler ou rota e preserva o relatorio original", () => {
  const statuses = ["pending", "running", "completed", "resumed", "failed", "timeout", "interrupted", "unavailable"];
  const report = {
    runDate: "2026-11-11", startedAt: "2026-11-11T03:00:00Z",
    projects: statuses.map(status => ({
      script: `projeto-${status}`, city: "Niteroi", kind: "Venda", status,
      error: status === "unavailable" ? "Diagnostico oculto" : "",
      outputTail: status === "unavailable" ? "Log oculto" : "",
    })),
  };
  const original = JSON.stringify(report);
  const html = reportHtml(report);
  for (const status of statuses.filter(status => status !== "unavailable")) {
    assert.ok(html.includes(`projeto-${status}`));
  }
  assert.doesNotMatch(html, /projeto-unavailable|Diagnostico oculto|Log oculto/);
  assert.equal((html.match(/<tr>/g) || []).length, 8);
  assert.match(html, /Total: 8/);
  assert.match(html, /Sem crawler\/rota: 1/);
  assert.equal(JSON.stringify(report), original);
  const onlyUnavailable = reportHtml({ ...report, projects: [report.projects.at(-1)] });
  assert.match(onlyUnavailable, /<tbody><\/tbody>/);
});

test("inatividade padrao e exatamente 20 minutos e configuracao invalida falha", () => {
  assert.equal(getIdleTimeout({}), 1200000);
  for (const value of ["", "zero", "0", "-1", "Infinity"]) {
    assert.throws(() => getIdleTimeout({ CRAWLER_IDLE_TIMEOUT_MINUTES: value }), /numero positivo/);
  }
});

test("saida em stdout ou stderr reinicia prazo; duracao total pode exceder limite ocioso", async t => {
  const cwd = fixture(t);
  fs.writeFileSync(path.join(cwd, "heartbeat.cjs"), `
let count = 0;
process.stdout.write("inicio");
const timer = setInterval(() => {
  process.stderr.write("ativo");
  if (++count === 8) { clearInterval(timer); process.exitCode = 0; }
}, 100);`);
  const started = Date.now();
  const result = await executeScript("heartbeat", "node heartbeat.cjs", {
    cwd, idleTimeoutMs: 500, stdout() {}, stderr() {},
  });
  assert.equal(result.status, "completed");
  assert.ok(Date.now() - started > 500);
});

test("prazo ocioso encerra processo e descendentes pelo PID", async t => {
  const cwd = fixture(t);
  fs.writeFileSync(path.join(cwd, "hang.cjs"), `
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
fs.writeFileSync("pids.json", JSON.stringify([process.pid, child.pid]));
console.log("aguardando");
setInterval(() => {}, 1000);`);
  const result = await executeScript("hang", "node hang.cjs", {
    cwd, idleTimeoutMs: 500, stdout() {}, stderr() {},
  });
  assert.equal(result.status, "timeout");
  assert.match(result.error, /Sem saida no log/);
  assert.match(result.outputTail, /aguardando/);
  for (const pid of JSON.parse(fs.readFileSync(path.join(cwd, "pids.json"), "utf8"))) {
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  }
});

test("falhas preservam codigo e trecho de diagnostico limitado", async t => {
  const cwd = fixture(t);
  fs.writeFileSync(path.join(cwd, "fail.cjs"), 'process.stdout.write("x".repeat(50000)); process.stderr.write("ERRO_TESTE"); process.exitCode = 7;');
  const result = await executeScript("fail", "node --expose-gc fail.cjs", {
    cwd, idleTimeoutMs: 5000, stdout() {}, stderr() {},
  });
  assert.equal(result.status, "failed");
  assert.equal(result.code, 7);
  assert.match(result.error, /codigo 7/);
  assert.match(result.outputTail, /ERRO_TESTE/);
  assert.ok(result.outputTail.length <= 16000);
  await assert.rejects(executeScript("invalid", undefined, { cwd }), /Comando nao suportado/);
});

test("lote tenta todos apos falha e timeout, persiste relatorio e retoma apenas concluidos", async t => {
  const directory = fixture(t);
  const { runBatch } = await import("./render-daily.js");
  const progressFile = path.join(directory, "progress.json");
  const reportPath = path.join(directory, "report.json");
  const calls = [];
  const scripts = ["1000imoveis", "1000imoveis:locacao", "marques", "nitkiffer"];
  const unavailable = [{ script: "nitamin:locacao", city: "Niteroi", kind: "Aluguel", error: "Sem rota" }];
  const run = async script => {
    calls.push(script);
    const saved = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    assert.equal(saved.projects.find(project => project.script === script).status, "running");
    if (script === "1000imoveis") throw new Error("Falha ao iniciar");
    if (script === "1000imoveis:locacao") return { status: "timeout", error: "Sem atividade", outputTail: "<erro>" };
    return { status: "completed", code: 0 };
  };
  const first = await runBatch({ scripts, unavailable, run, prepare() {}, progressFile, reportPath });
  assert.equal(first.success, false);
  assert.deepEqual(calls, scripts);
  assert.deepEqual(first.report.projects.map(project => project.status), ["failed", "timeout", "completed", "completed", "unavailable"]);
  const savedProgress = JSON.parse(fs.readFileSync(progressFile, "utf8"));
  assert.deepEqual(Object.keys(savedProgress[first.report.runDate]), ["marques", "nitkiffer"]);
  const html = fs.readFileSync(reportPath.replace(".json", ".html"), "utf8");
  assert.match(html, /Falha ao iniciar/);
  assert.match(html, /&lt;erro&gt;/);
  assert.doesNotMatch(html, /nitamin:locacao/);
  assert.match(html, /Sem crawler\/rota: 1/);
  assert.equal(JSON.parse(fs.readFileSync(reportPath, "utf8")).projects.at(-1).status, "unavailable");
  assert.ok(first.report.endedAt);
  calls.length = 0;
  const second = await runBatch({ scripts, run: async script => { calls.push(script); return { status: "completed" }; }, prepare() {}, progressFile, reportPath });
  assert.equal(second.success, true);
  assert.deepEqual(calls, scripts.slice(0, 2));
  assert.deepEqual(second.report.projects.map(project => project.status), ["completed", "completed", "resumed", "resumed"]);
});

test("erro de preparacao mantem todos nao tentados e gera relatorio sem sucesso falso", async t => {
  const directory = fixture(t);
  const { runBatch } = await import("./render-daily.js");
  const result = await runBatch({
    scripts: ["1000imoveis", "nitkiffer"],
    prepare() { throw new Error("Credencial ausente"); },
    run() { assert.fail("nao deve iniciar raspagem"); },
    progressFile: path.join(directory, "progress.json"), reportPath: path.join(directory, "report.json"),
  });
  assert.equal(result.success, false);
  assert.equal(result.report.error, "Credencial ausente");
  assert.deepEqual(result.report.projects.map(project => project.status), ["pending", "pending"]);
  assert.match(reportHtml(result.report), /Nao tentados: 2/);
});

test("lote exclui Acervo, Souza Gomes e Multimoveis da execucao, pendencias e reports mesmo com selecao antiga", async t => {
  const directory = fixture(t);
  const { runBatch } = await import("./render-daily.js");
  const calls = [];
  const excluded = ["acervo", "acervo:locacao", "souzagomes", "souzagomes:locacao", "multimoveis", "multimoveis:locacao"];
  const progressFile = path.join(directory, "progress.json");
  const reportPath = path.join(directory, "report.json");
  const result = await runBatch({
    scripts: [...excluded, "admyhouse"],
    unavailable: excluded.map(script => ({ script, error: "Pendencia antiga" })),
    prepare() {},
    run: async script => { calls.push(script); return { status: "completed" }; },
    progressFile, reportPath,
  });
  assert.equal(result.success, true);
  assert.deepEqual(calls, ["admyhouse"]);
  assert.deepEqual(result.report.projects.map(project => project.script), ["admyhouse"]);
  for (const file of [reportPath, reportPath.replace(".json", ".html"), progressFile]) {
    assert.doesNotMatch(fs.readFileSync(file, "utf8"), /acervo|souzagomes|multimoveis/i);
  }
  assert.match(fs.readFileSync(reportPath.replace(".json", ".html"), "utf8"), /Total: 1/);
});

test("sem rota nao duplica entrada nem reutiliza checkpoint de uma coleta inexistente", async t => {
  const directory = fixture(t);
  const { runBatch } = await import("./render-daily.js");
  const result = await runBatch({
    scripts: ["kantto:locacao"],
    unavailable: [{ script: "kantto:locacao", city: "Juiz de Fora", kind: "Aluguel", error: "Sem rota" }],
    prepare() {}, run() { assert.fail("nao deve executar preparacao destrutiva"); },
    progressFile: path.join(directory, "progress.json"), reportPath: path.join(directory, "report.json"),
  });
  assert.equal(result.report.projects.length, 1);
  assert.equal(result.report.projects[0].status, "unavailable");
  assert.equal(result.success, false);
});

test("executor diario real isola erro e travamento, chega a Niteroi e salva resultados", t => {
  const directory = fixture(t);
  const backend = path.join(directory, "backend");
  fs.mkdirSync(backend);
  for (const file of ["render-daily.js", "crawler-order.cjs", "crawler-execution.cjs", "crawler-report.cjs", "crawler-availability.cjs", "publication-profiles.cjs", "node-runtime.cjs", "backend-paths.cjs"]) {
    fs.copyFileSync(path.join(__dirname, file), path.join(backend, file));
  }
  fs.writeFileSync(path.join(backend, "package.json"), JSON.stringify({
    type: "module",
    scripts: {
      "1000imoveis": "node fail.cjs",
      "1000imoveis:locacao": "node hang.cjs",
      nitkiffer: "node ok.cjs",
    },
  }));
  fs.writeFileSync(path.join(backend, "fail.cjs"), 'console.error("FALHA_COLETA"); process.exitCode = 4;');
  fs.writeFileSync(path.join(backend, "hang.cjs"), 'console.log("aguardando site"); setInterval(() => {}, 1000);');
  fs.writeFileSync(path.join(backend, "ok.cjs"), 'console.log("NITEROI_EXECUTADO");');
  const reportPath = path.join(backend, "report.json");
  const result = spawnSync(process.execPath, [path.join(backend, "render-daily.js")], {
    env: {
      ...process.env, SCRAPE_SCRIPTS: "nitkiffer,1000imoveis",
      CRAWLER_REPORT_PATH: reportPath, CRAWLER_FORCE_RERUN: "false",
      CRAWLER_UNAVAILABLE_PROJECTS: "[]", CRAWLER_IDLE_TIMEOUT_MINUTES: "0.01",
      FIREBASE_SERVICE_ACCOUNT_JSON: "{}", GOOGLE_SERVICE_ACCOUNT_JSON: "{}",
    },
    encoding: "utf8", timeout: 15000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /NITEROI_EXECUTADO/);
  assert.match(result.stderr, /continuando para o proximo projeto/);
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.deepEqual(report.projects.map(project => project.status), ["failed", "timeout", "completed"]);
  assert.match(report.projects[0].outputTail, /FALHA_COLETA/);
  const checkpoint = JSON.parse(fs.readFileSync(path.join(backend, "logs", "crawler-daily-progress.json"), "utf8"));
  assert.deepEqual(Object.keys(checkpoint[report.runDate]), ["nitkiffer"]);
});
