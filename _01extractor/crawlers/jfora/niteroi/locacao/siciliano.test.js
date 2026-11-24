import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCardSiciliano } from "../nitSiciliano/extractor.js";
import { getProjetoNiteroiLocacao } from "./projects.js";
import { contar, coletar, parseTotalAluguelSiciliano } from "./siciliano.js";

const project = getProjetoNiteroiLocacao("nitSiciliano");
const card = (id = 1) => `<div class="LI_Imovel"><div class="rentPurposeClass">
<div class="ImageSide"><span class="ImovelId"><span class="id">${id}</span></span>
<h5 class="ImovelValor"><span class="value">R$ 900.000</span>Valor de Venda</h5>
<h5 class="ImovelValor"><span class="value">R$ 2.500,75</span>Pre&#231;o de Aluguel (Mensal)</h5>
<h5 class="totalPack"><span class="value">R$ 3.500</span>Pacote de Aluguel</h5></div>
<a class="Title" href="/apartamento-${id}">Apartamento em Icarai</a><span class="SubCategoria">Apartamento</span>
<span class="Endereco"><span class="Bairro">Icara&#237;</span><span class="cidade">Niter&#243;i</span><span class="Estado">RJ</span></span>
</div></div>`;
const parse = html => parseCardSiciliano(html, new Date("2026-10-16"), { negociacao: "aluguel", projeto: project });

function fake(snapshots, { url = project.url, ok = true } = {}) {
  let index = 0, closed = 0;
  return { browser: { newPage: async () => ({
    goto: async () => ({ ok: () => ok, status: () => 403 }), url: () => url,
    waitForFunction: async () => {}, $eval: async () => snapshots[index].label,
    evaluate: async () => snapshots[index], click: async () => { index++; },
    close: async () => { closed++; },
  }) }, closed: () => closed };
}
const snapshot = (cards, total = 2, hasMore = true) => ({ cards, label: `${total} Imoveis para alugar encontrados`, hasMore });

test("aluguel mensal ignora venda e pacote; identidade, slugs e data preservados", () => {
  const record = parse(card());
  assert.equal(record.preco, 2500.75);
  assert.equal(record.tipoImovel, "apartamento");
  assert.equal(record.bairro, "icarai");
  assert.equal(record.cidade, "niteroi-rj");
  assert.equal(record.corretor, project.displayName);
  assert.equal(record.atualizadoEm, "2026-10-16T00:00:00.000Z");
  assert.equal(Object.keys(record).length, 20);
  assert.equal(parse(card().replace("R$ 2.500,75", "Consulte")).preco, null);
  assert.throws(() => parseCardSiciliano(card()), /finalidade/);
  assert.throws(() => parse(card().replace("rentPurposeClass", "salePurposeClass")), /finalidade/);
  assert.throws(() => parse(card().replace("Pre&#231;o de Aluguel (Mensal)", "Valor de Venda")), /Preco/);
  assert.throws(() => parse(card().replace("R$ 2.500,75", "erro")), /Preco/);
});

test("contagem exclusiva de aluguel aceita milhar, singular e zero", async () => {
  for (const [label, expected] of [["1.234 Imoveis para alugar encontrados", 1234], ["1 Imovel para alugar encontrado", 1], ["0 Imoveis para alugar encontrados", 0]]) assert.equal(parseTotalAluguelSiciliano(label), expected);
  for (const label of ["20 Imoveis a venda encontrados", "sem imoveis", "-1 Imoveis para alugar encontrados"]) assert.throws(() => parseTotalAluguelSiciliano(label));
  const f = fake([snapshot([], 16)]);
  assert.equal(await contar(f.browser, project), 16);
  assert.equal(f.closed(), 1);
  for (const options of [{ url: project.url.replace("aluguel", "venda") }, { ok: false }]) {
    const invalid = fake([snapshot([], 16)], options);
    await assert.rejects(contar(invalid.browser, project));
    assert.equal(invalid.closed(), 1);
  }
});

test("coleta completa, check parcial e zero; falhas nunca retornam coleta incompleta", async () => {
  let f = fake([snapshot([card()]), snapshot([card(), card(2)], 2, false)]);
  assert.equal((await coletar(f.browser, project, { totalEsperado: 2, check: false, anteriores: new Map() })).length, 2);
  assert.equal(f.closed(), 1);
  f = fake([snapshot([card()])]);
  assert.equal((await coletar(f.browser, project, { totalEsperado: 2, check: true })).length, 1);
  f = fake([snapshot([], 0, false)]);
  assert.deepEqual(await coletar(f.browser, project, { totalEsperado: 0 }), []);
  for (const snapshots of [[snapshot([card()], 3)], [snapshot([card()], 2, false)], [snapshot([card()]), snapshot([card()])]]) {
    f = fake(snapshots);
    await assert.rejects(coletar(f.browser, project, { totalEsperado: 2 }));
    assert.equal(f.closed(), 1);
  }
  await assert.rejects(coletar(fake([]).browser, project, {}), /Precontagem/);
});
