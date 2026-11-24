import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createFirestorePanelCache } from "./firestore-panel-cache.js";

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "firestore-panel-cache-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return path.join(directory, "cache.json");
}

test("cache ausente nao dispara consulta; atualizacao explicita e persistente e limitada a 15 minutos", async t => {
  const file = fixture(t);
  const cache = createFirestorePanelCache(file);
  assert.equal(cache.get("counts"), null);
  let reads = 0;
  const load = async () => { reads++; return { total: 42 }; };
  const [first, concurrent] = await Promise.all([cache.refresh("counts", load), cache.refresh("counts", load)]);
  assert.equal(reads, 1);
  assert.deepEqual(first, concurrent);
  assert.deepEqual(await cache.refresh("counts", load), first);
  const restarted = createFirestorePanelCache(file);
  assert.deepEqual(restarted.get("counts"), first);
  await restarted.refresh("counts", load);
  assert.equal(reads, 1);
  const data = JSON.parse(fs.readFileSync(file));
  data.entries.counts.updatedAt = "2000-01-01T00:00:00.000Z";
  fs.writeFileSync(file, JSON.stringify(data));
  assert.equal(restarted.get("counts").value.total, 42);
  assert.equal(reads, 1);
  await restarted.refresh("counts", load);
  assert.equal(reads, 2);
});

test("falha de quota nao vira sucesso nem sobrescreve snapshot; novas tentativas tem espera", async t => {
  const file = fixture(t);
  fs.writeFileSync(file, JSON.stringify({ version: 1, entries: {
    counts: { updatedAt: "2000-01-01", value: { total: 42 } },
  } }));
  const cache = createFirestorePanelCache(file);
  let reads = 0;
  const load = async () => { reads++; throw Object.assign(new Error("quota exceeded"), { code: 8 }); };
  await assert.rejects(cache.refresh("counts", load), /quota/);
  await assert.rejects(cache.refresh("counts", load), /quota/);
  assert.equal(reads, 1);
  assert.equal(cache.get("counts").value.total, 42);
});

test("cache corrompido gera erro explicito e nunca tenta a nuvem como fallback", async t => {
  const file = fixture(t);
  fs.writeFileSync(file, "{");
  const cache = createFirestorePanelCache(file);
  assert.throws(() => cache.get("counts"));
  assert.throws(() => cache.refresh("counts", () => assert.fail("Nao consultar nuvem")));
});
