import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { cidadeUba, projetosUba, getProjetoUba } from "./projects.js";
import { runProjetoUba } from "./runProject.js";
import { descobrirScriptsExecucao } from "../../../../crawler-runner-vendas.cjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const expected = [
  "ubaJXavier", "ubaGb", "ubaMontezzi", "ubaCarlos", "ubaNogueira",
  "ubaArtolex", "ubaCidade", "ubaRemax", "ubaAloisio",
];

test("cadastro e pasta tem exatamente nove imobiliarias configuradas", () => {
  assert.deepEqual(projetosUba.map(project => project.collection), expected);
  assert.deepEqual(cidadeUba, { nome: "Ub\u00e1", slug: "uba", uf: "MG" });
  assert.equal(new Set(projetosUba.map(project => project.folder)).size, 9);
  assert.deepEqual(fs.readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort(), [...expected].sort());
  for (const project of projetosUba) {
    assert.equal(getProjetoUba(project.collection.toUpperCase()), project);
    assert.equal(project.folder, project.collection);
    assert.equal(project.enabled, ["ubaJXavier", "ubaGb", "ubaMontezzi", "ubaCarlos", "ubaNogueira", "ubaArtolex", "ubaCidade", "ubaRemax", "ubaAloisio"].includes(project.collection));
    for (const key of ["urlVendas", "urlLocacao", "modeloSite"]) {
      if (project.enabled) assert.ok(project[key]);
      else assert.equal(project[key], null);
    }
    for (const name of ["config.js", "index.js", "locacao.js"]) {
      assert.ok(fs.existsSync(path.join(root, project.folder, name)));
    }
  }
});

test("vendas e aluguel dos projetos pendentes rejeitam coleta sem configuracao", async () => {
  for (const project of projetosUba.filter(project => !project.enabled)) {
    for (const negociacao of ["venda", "locacao"]) {
      await assert.rejects(runProjetoUba(project.collection, negociacao), error =>
        error.code === "UBA_PROJETO_NAO_CONFIGURADO" &&
        error.message.includes(project.collection) &&
        error.message.includes("dados existentes preservados"));
    }
  }
  await assert.rejects(runProjetoUba("desconhecido"), /nao encontrado/);
  await assert.rejects(runProjetoUba("ubaGb", "outro"), /Negociacao invalida/);
});

test("projetos removidos nao permanecem no cadastro", () => {
  for (const name of ["ubaBarletta", "ubaAroldo", "ubaSimone", "ubaLuciano", "ubaMarcelo",
    "ubaJmc", "ubaMapa", "ubaGomes", "ubaSantos", "ubaDiretriz", "ubaLucarelli"]) {
    assert.throws(() => getProjetoUba(name), /nao encontrado/);
    assert.equal(fs.existsSync(path.join(root, name)), false);
  }
});

test("modo check lista nove projetos e fila automatica inclui dezoito etapas Uba", () => {
  const check = spawnSync(process.execPath, [path.join(root, "runAll.js"), "--check"], { encoding: "utf8", timeout: 10000 });
  assert.equal(check.status, 0, check.stderr);
  assert.equal(check.stdout.trim().split(/\r?\n/).length, 9);
  for (const name of expected) assert.ok(check.stdout.includes(name));
  const scripts = descobrirScriptsExecucao(path.resolve(root, "../../../.."));
  assert.equal(scripts.length, 184);
  assert.deepEqual(scripts.filter(name => name.startsWith("uba")),
    expected.flatMap(name => [name.toLowerCase(), `${name.toLowerCase()}:locacao`]));
});
