import assert from "node:assert/strict";
import test from "node:test";
import { coletarFaixasMidas, projetoFaixaMidas } from "./faixasMidas.js";

const project = {
  collection: "rioDna", urlVendas: "https://example.com/imoveis/venda#/?tipoNegocio=VA,VL&page=1",
  midas: { limitesFaixasVenda: [100, 200] },
};
const item = (linkReal, preco, dataInclusao = "a") => ({ linkReal, preco, codigoBase: linkReal, dataInclusao, atualizadoEm: dataInclusao });
const zero = item("zero", null);
const borda = item("borda", 100.75);
const ultimo = item("ultimo", 300);
const batches = [[zero, borda], [item("zero", null, "b"), item("borda", 100.75, "b")], [zero, ultimo]];
const dependencies = data => ({
  contar: async (_browser, faixa) => data[faixaIndex(faixa)].length,
  coletar: async (_browser, faixa) => data[faixaIndex(faixa)],
});
function faixaIndex(faixa) {
  const params = new URLSearchParams(new URL(faixa.urlVendas).hash.slice(3));
  return ["0,100", "100,200", "200,0"].indexOf(params.get("valor"));
}

test("faixas inteiras sobrepostas preservam filtros e deduplicam limites e consulta", async () => {
  const results = await coletarFaixasMidas(null, project, "venda", { totalEsperado: 3 }, dependencies(batches));
  assert.deepEqual(results.map(record => record.linkReal), ["zero", "borda", "ultimo"]);
  const url = new URL(projetoFaixaMidas(project, 100, 200).urlVendas);
  const params = new URLSearchParams(url.hash.slice(3));
  assert.equal(params.get("tipoNegocio"), "VA,VL");
  assert.equal(params.get("valor"), "100,200");
  assert.equal(params.get("page"), "1");
});

test("check simples usa apenas a busca original", async () => {
  let calls = 0;
  const result = await coletarFaixasMidas(null, project, "venda", { totalEsperado: 30, primeiraPagina: true }, {
    contar: async () => assert.fail("nao deve contar faixas"),
    coletar: async (_browser, received, _tipo, options) => {
      calls++;
      assert.equal(received, project);
      assert.equal(options.primeiraPagina, true);
      return [ultimo];
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, [ultimo]);
});

test("recusa divergencias, duplicatas indevidas e contagem incompleta", async () => {
  const run = (data, total = 3) => coletarFaixasMidas(null, project, "venda", { totalEsperado: total }, dependencies(data));
  await assert.rejects(run([[zero, borda], [zero, item("borda", 100)], [zero, ultimo]]), /divergente/);
  await assert.rejects(run([[zero, item("x", 50)], [zero, item("x", 50)], [zero, ultimo]]), /fora do limite/);
  await assert.rejects(run([[zero, borda], [zero, borda], [zero, ultimo]], 4), /Faixas incompletas/);
  await assert.rejects(run([[zero, zero], [zero], [ultimo]]), /duplicatas/);
  await assert.rejects(run([[zero], [], [zero, ultimo]], 1), /Total invalido|excedeu/);
});

test("rejeita configuracoes invalidas e propagacao de falha de pagina", async () => {
  assert.throws(() => projetoFaixaMidas(project, 100, 99), /invalida/);
  await assert.rejects(coletarFaixasMidas(null, { ...project, midas: { limitesFaixasVenda: [100, 100] } }, "venda", { totalEsperado: 1 }), /invalidos/);
  await assert.rejects(coletarFaixasMidas(null, project, "locacao", { totalEsperado: 1 }), /apenas para venda/);
  await assert.rejects(coletarFaixasMidas(null, project, "venda", { totalEsperado: 2 }, {
    contar: async () => 1,
    coletar: async () => { throw new Error("falha de pagina"); },
  }), /falha de pagina/);
});
