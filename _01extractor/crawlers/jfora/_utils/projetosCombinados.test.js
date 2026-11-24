import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { expandirEtapas, montarProjetosCombinados } from "./projetosCombinados.js";
import { rodarRaspagemCompleta } from "../_1Jf/raspagemCompleta.js";

const scripts = JSON.parse(fs.readFileSync(new URL("../../../../package.json", import.meta.url), "utf8")).scripts;
const projetos = montarProjetosCombinados(scripts);

test("cada imobiliaria vira um unico projeto com venda seguida de aluguel", () => {
  const remaxJf = projetos.find(projeto => projeto.colecao === "jfRemax");
  assert.deepEqual([remaxJf.venda, remaxJf.aluguel], ["remax", "remax:locacao"]);
  const remaxNit = projetos.find(projeto => projeto.colecao === "nitRemax");
  assert.deepEqual([remaxNit.venda, remaxNit.aluguel], ["nitremax", "nitremax:locacao"]);
  const amin = projetos.find(projeto => projeto.colecao === "nitAmin");
  assert.deepEqual([amin.venda, amin.aluguel], ["nitamin", null]);
  const grupo = projetos.find(projeto => projeto.colecao === "nitGrupo");
  assert.deepEqual([grupo.name, grupo.venda, grupo.aluguel], ["nitgrupo:locacao", null, "nitgrupo:locacao"]);
  assert.equal(new Set(projetos.map(projeto => projeto.name)).size, projetos.length);
  const alugueis = Object.keys(scripts).filter(name => name.endsWith(":locacao"));
  assert.equal(projetos.filter(projeto => projeto.aluguel).length, alugueis.length);
});

test("expansao preserva ordem venda -> aluguel e scripts avulsos", () => {
  const etapas = expandirEtapas(["remax", "nitamin", "typesense:sync"], projetos);
  assert.deepEqual(etapas.map(etapa => etapa.script), ["remax", "remax:locacao", "nitamin", "typesense:sync"]);
});

test("raspagem completa roda todos os projetos sem agregadores e continua apos falhas", async () => {
  const chamadas = [];
  const executar = async script => { chamadas.push(script); return script === "remax" ? 1 : 0; };
  const { etapas, falhas } = await rodarRaspagemCompleta([], { executar, scripts });
  assert.ok(!chamadas.includes("niteroi") && !chamadas.includes("niteroi:vendas:validar"));
  assert.equal(chamadas.indexOf("remax:locacao"), chamadas.indexOf("remax") + 1);
  assert.equal(chamadas.indexOf("nitremax:locacao"), chamadas.indexOf("nitremax") + 1);
  assert.equal(chamadas.length, etapas.length);
  assert.deepEqual(falhas, ["jfRemax vendas"]);
  const filtrado = [];
  await rodarRaspagemCompleta(["nitRemax"], { executar: async s => { filtrado.push(s); return 0; }, scripts });
  assert.deepEqual(filtrado, ["nitremax", "nitremax:locacao"]);
});
