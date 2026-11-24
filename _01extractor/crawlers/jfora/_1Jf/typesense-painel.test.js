import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";

const html = fs.readFileSync(new URL("./painel.html", import.meta.url), "utf8");
const start = html.indexOf('btnTypesense.addEventListener("click", async () => {');
const end = html.indexOf('btnCheckCitySlug?.addEventListener', start);

async function enviar(fetch, confirmar = true, selecionados = ["jfLider"]) {
  let click;
  const logs = [];
  const label = { textContent: "" };
  const button = { disabled: false, addEventListener: (_event, callback) => { click = callback; } };
  vm.runInNewContext(html.slice(start, end), {
    btnTypesense: button, typesenseSource: { value: "json" },
    getTypesenseSelectedProjects: () => selecionados, typesenseProjectsLoaded: true,
    window: {}, confirmarNoPainel: async () => confirmar,
    typesenseOutputBuffer: "", typesenseProgressLabel: label,
    setTypesenseProgress: (_current, _total, text) => { label.textContent = text; },
    appendLog: text => logs.push(text), fetch,
  });
  await click();
  return { label: label.textContent, button, logs };
}

test("Typesense exibe bloqueio e erros de rede na propria aba", async () => {
  for (const fetch of [
    async () => ({ ok: false, json: async () => ({ error: "Ja existe uma execucao em andamento." }) }),
    async () => { throw new Error("Failed to fetch"); },
    async () => ({ ok: true, json: async () => { throw new Error("JSON invalido"); } }),
  ]) {
    const result = await enviar(fetch);
    assert.match(result.label, /Não foi possível iniciar a transmissão:/);
    assert.equal(result.button.disabled, false);
    assert.equal(result.logs.length, 1);
  }
});

test("Typesense envia origem json e informa inicio sem publicar durante o teste", async () => {
  const result = await enviar(async (url, options) => {
    assert.equal(url, "/api/send-typesense");
    assert.equal(JSON.parse(options.body).source, "json");
    assert.deepEqual(JSON.parse(options.body).selectedProjects, ["jfLider"]);
    return { ok: true, json: async () => ({ ok: true, source: "json" }) };
  });
  assert.match(result.label, /Transmissão iniciada/);
  assert.equal(result.button.disabled, false);
  assert.match(result.logs[0], /direto dos JSONs locais/);
});

test("cancelar confirmacao nao envia requisicao", async () => {
  await enviar(async () => { assert.fail("Nao deve enviar"); }, false);
});

test("Typesense impede envio com todos os projetos desmarcados", async () => {
  const result = await enviar(async () => assert.fail("Nao deve publicar sem selecao"), true, []);
  assert.match(result.label, /Selecione pelo menos um projeto/);
});

const fsStart = html.indexOf('btnPublishJson.addEventListener("click", async () => {');
const fsEnd = html.indexOf("function formatNumber(", fsStart);

async function publicarFirestore(fetch, { confirmar = true, selecionados = ["nitflora"] } = {}) {
  let click;
  const logs = [];
  const progress = { visible: false, width: "", label: "" };
  const button = { disabled: false, addEventListener: (_event, callback) => { click = callback; } };
  vm.runInNewContext(html.slice(fsStart, fsEnd), {
    btnPublishJson: button, getSelectedScripts: () => selecionados,
    confirmarNoPainel: async () => confirmar, firestorePublishOutputBuffer: "",
    setFirestoreProgress: (current, total, name, status) => { progress.label = `${current}/${total} ${name} ${status}`; },
    setFirestoreMessage: (text) => { progress.visible = true; progress.label = text; },
    appendLog: (text) => logs.push(text), fetch, JSON,
  });
  await click();
  return { progress, button, logs };
}

test("Firestore mostra progresso visivel em sucesso, bloqueio, cancelamento e selecao vazia", async () => {
  let ok = await publicarFirestore(async (url) => {
    assert.equal(url, "/api/publish-json");
    return { ok: true, status: 200, json: async () => ({ ok: true, collectionNames: ["nitFlora"] }) };
  });
  assert.match(ok.progress.label, /Transmissão iniciada para 1 coleção/);
  assert.equal(ok.button.disabled, false);

  const busy = await publicarFirestore(async () => ({ ok: false, status: 409, json: async () => ({ error: "Ja existe" }) }));
  assert.match(busy.progress.label, /em andamento/);
  assert.equal(busy.progress.visible, true);

  const cancelado = await publicarFirestore(async () => assert.fail("Nao deve enviar"), { confirmar: false });
  assert.match(cancelado.progress.label, /cancelada/);

  const vazio = await publicarFirestore(async () => assert.fail("Nao deve enviar"), { selecionados: [] });
  assert.match(vazio.progress.label, /Selecione/);
});

test("painel nao depende de window.confirm nativo para transmitir", () => {
  const firestore = html.slice(fsStart, fsEnd);
  const typesense = html.slice(start, end);
  assert.ok(!firestore.includes("window.confirm") && !typesense.includes("window.confirm"));
  assert.ok(html.includes('id="confirmOverlay"'));
});

test("mensagens de conclusao e falha reconhecem atual, backup e json", () => {
  const expressions = [...html.matchAll(/if \((\/\^<<< .*?\/)\.test\(msg\.message\)\) \{/g)]
    .map(match => match[1]).filter(expression => expression.includes("typesense:sync"));
  assert.equal(expressions.length, 2);
  const [ok, failed] = expressions.map(expression => new RegExp(expression.slice(1, -1)));
  for (const script of ["typesense:sync", "typesense:sync:backup", "typesense:sync:json"]) {
    assert.ok(ok.test(`<<< [${script}] OK`));
    assert.ok(failed.test(`<<< [${script}] FALHOU`));
    assert.ok(failed.test(`<<< [${script}] CANCELADO`));
  }
});
