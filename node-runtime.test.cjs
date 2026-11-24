const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { resolveNodeExecutable } = require("./node-runtime.cjs");
const { executeScript } = require("./crawler-execution.cjs");

test("Node normal mantem o executavel atual e override invalido nao tem fallback silencioso", () => {
  assert.equal(resolveNodeExecutable({ packaged: false, env: {} }), process.execPath);
  assert.throws(() => resolveNodeExecutable({ packaged: false, env: { CRAWLER_NODE_EXECUTABLE: path.join(os.tmpdir(), "node-inexistente.exe") } }), /Node.js instalado nao encontrado/);
});

test("launcher empacotado resolve Node real pelo PATH e nunca reutiliza a si proprio", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "node-runtime-"));
  t.after(() => fs.rmSync(root, { recursive: true }));
  const launcher = path.join(root, "launcher.exe");
  const installed = path.join(root, "installed");
  fs.mkdirSync(installed);
  const node = path.join(installed, "node.exe");
  fs.writeFileSync(launcher, "");
  fs.writeFileSync(node, "");
  assert.equal(resolveNodeExecutable({ packaged: true, execPath: launcher, platform: "win32", env: { Path: `${root};"${installed}"` } }), node);
  assert.throws(() => resolveNodeExecutable({ packaged: true, execPath: node, platform: "win32", env: { PATH: installed } }), /Node.js instalado nao encontrado/);
  assert.equal(resolveNodeExecutable({ packaged: true, execPath: launcher, env: { CRAWLER_NODE_EXECUTABLE: node } }), node);
});

test("executor roda flags de Node em runtime externo mesmo sob process.pkg", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "node-runtime-flags-"));
  t.after(() => fs.rmSync(root, { recursive: true, maxRetries: 10, retryDelay: 100 }));
  fs.writeFileSync(path.join(root, "check.cjs"), `
if (process.pkg || typeof global.gc !== "function") process.exitCode = 9;
console.log("NODE_REAL_GC", typeof global.gc);`);
  const external = path.join(root, process.platform === "win32" ? "node.exe" : "node");
  fs.copyFileSync(process.execPath, external);
  const previous = process.pkg;
  process.pkg = { entrypoint: "launcher" };
  try {
    let output = "";
    const result = await executeScript("check", "node --expose-gc --max-old-space-size=256 check.cjs", {
      cwd: root, env: { ...process.env, CRAWLER_NODE_EXECUTABLE: external },
      stdout: chunk => { output += chunk; }, stderr() {}, idleTimeoutMs: 5000,
    });
    assert.equal(result.status, "completed", result.outputTail);
    assert.match(output, /NODE_REAL_GC function/);
  } finally {
    if (previous === undefined) delete process.pkg;
    else process.pkg = previous;
  }
});
