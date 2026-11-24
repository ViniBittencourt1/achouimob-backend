import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mock, test } from "node:test";

const backendRoot = fileURLToPath(new URL("../../", import.meta.url));
const crawlerDir = path.join(backendRoot, "crawler");
const files = new Map();
let readError;
const writes = [];
const storage = {
  existsSync: file => files.has(file),
  readFileSync: file => {
    if (readError) throw readError;
    if (!files.has(file)) throw Object.assign(new Error("Arquivo ausente"), { code: "ENOENT" });
    return files.get(file);
  },
  writeFileSync: (file, content) => { writes.push(file); files.set(file, content); },
  mkdirSync: () => {},
};
mock.module("fs", { defaultExport: storage });
const { getCollectionAsMap } = await import("./crawlerJson.js");

function reset() {
  files.clear();
  writes.length = 0;
  readError = undefined;
}

test("base local carrega registros e datas sem consultar servicos remotos", async () => {
  reset();
  const records = [
    { linkReal: "https://example.com/1", dataInclusao: "2026-10-01", codigoBase: "1" },
    { linkReal: "https://example.com/2", codigoBase: "2" },
    null,
    { titulo: "sem chave" },
  ];
  files.set(path.join(crawlerDir, "nitKiffer.json"), JSON.stringify(records));
  const byLink = await getCollectionAsMap("nitKiffer", "linkReal");
  assert.equal(byLink.size, 2);
  assert.deepEqual(byLink.get(records[0].linkReal), records[0]);
  assert.equal((await getCollectionAsMap("nitKiffer", "codigoBase")).size, 2);
  assert.equal(writes.length, 0);
});

test("primeira coleta e base vazia nao precisam de Firebase ou credenciais", async () => {
  reset();
  assert.equal((await getCollectionAsMap("jfNovo", "linkReal")).size, 0);
  files.set(path.join(crawlerDir, "jfNovo.json"), "[]");
  assert.equal((await getCollectionAsMap("jfNovo", "linkReal")).size, 0);
  assert.equal(writes.length, 0);
});

test("JSON corrompido ou fora do formato interrompe a leitura sem sobrescrever a base", async () => {
  for (const content of ["{invalido", "{}", "null"]) {
    reset();
    const file = path.join(crawlerDir, "nitKiffer.json");
    files.set(file, content);
    await assert.rejects(getCollectionAsMap("nitKiffer", "linkReal"), /base preservada/);
    assert.equal(files.get(file), content);
    assert.equal(writes.length, 0);
  }
});

test("falha de acesso ao arquivo e propagada em vez de iniciar uma base vazia", async () => {
  reset();
  readError = Object.assign(new Error("Acesso negado"), { code: "EACCES" });
  await assert.rejects(getCollectionAsMap("nitKiffer", "linkReal"), { code: "EACCES" });
  assert.equal(writes.length, 0);
  readError = undefined;
});

test("separacao preserva correcoes manuais, grupos duplicados e historico local", async () => {
  reset();
  const outros = path.join(backendRoot, "_03database", "outros");
  const filtros = path.join(backendRoot, "_03database", "filtros");
  const linkReal = "https://example.com/1";
  files.set(path.join(outros, "city-json-manual-corrections.json"),
    JSON.stringify([
      { file: "nitKiffer.json", linkReal, cidade: "niteroi-rj" },
      { file: "nitKiffer.json", linkReal: "https://example.com/2", cidade: "", limparCidade: true },
    ]));
  files.set(path.join(filtros, "_jfBairrosManualCorrections.json"),
    JSON.stringify([{ file: "nitKiffer.json", linkReal, bairro: "icarai" }]));
  files.set(path.join(outros, "duplicados-grupos.json"),
    JSON.stringify({ grupos: { grupo1: { membros: [{ collectionName: "nitKiffer", linkReal }] } } }));
  const file = path.join(crawlerDir, "nitKiffer.json");
  storage.writeFileSync(file, JSON.stringify([
    { linkReal, preco: 100, tipoImovel: "apartamento" },
    { linkReal: "https://example.com/2", cidade: "Internacional", bairro: "Miami" },
  ]), "utf8");
  const [record, clearedCity] = JSON.parse(files.get(file));
  assert.equal(record.cidade, "niteroi-rj");
  assert.equal(clearedCity.cidade, "");
  assert.equal(clearedCity.bairro, "Miami");
  assert.equal(record.bairro, "icarai");
  assert.equal(record.duplicado_grupo, "grupo1");
  const history = JSON.parse(files.get(path.join(filtros, "jfHistoricoRaspagens.json")));
  assert.ok(Object.values(history.nitKiffer).some(day => day.totalImoveis === 2));
});
