import assert from "node:assert/strict";
import { test } from "node:test";
import { mapearCardRio, projetoKenlo, coletarKenloRio } from "./kenlo.js";
import { getProjetoRio } from "./projects.js";

const project = getProjetoRio("rioCasalta");
const card = `<a class="card-with-buttons" href="/imovel/apartamento-rio/AP123">
<p class="card-with-buttons__title">Apartamento</p>
<h2 class="card-with-buttons__heading">Copacabana - Rio de Janeiro - RJ</h2>
<p class="card-with-buttons__code">AP123</p>
<p class="card-with-buttons__value">R$ 850.000,50</p>
<ul><li>90 m²</li><li>2 Quartos</li><li>1 Banheiro</li><li>1 Vaga</li></ul>
<img src="https://example.com/foto.jpg"></a>`;

test("parser Rio resolve catalogos e preserva vinte campos de vendas", () => {
  const item = mapearCardRio(card, projetoKenlo(project, "venda"), "venda");
  assert.equal(Object.keys(item).length, 20);
  assert.equal(item.cidade, "rio-de-janeiro-rj");
  assert.equal(item.bairro, "copacabana");
  assert.equal(item.tipoImovel, "apartamento");
  assert.equal(item.preco, 850000.5);
  assert.equal(item.dormitorioValor, 2);
  assert.equal(item.areaValor, 90);
});

test("parser aluguel nao soma encargos e nao inventa venda", () => {
  const html = card.replace('<p class="card-with-buttons__value">R$ 850.000,50</p>',
    '<div class="card-with-buttons__value-container"><p class="card-with-buttons__value-title">Aluguel</p><p class="card-with-buttons__value">R$ 2.500,75</p></div><p>IPTU R$ 200,00; Condominio R$ 500,00</p>');
  const item = mapearCardRio(html, projetoKenlo(project, "locacao"), "locacao");
  assert.equal(item.preco, 2500.75);
  assert.equal(item.bairro, "copacabana");
  assert.equal(Object.keys(item).length, 20);
});

test("origem, identidade e finalidade sao verificadas", () => {
  const configured = projetoKenlo(project, "venda");
  assert.throws(() => mapearCardRio(card.replace('href="/imovel/', 'href="https://outro.example/imovel/'), configured, "venda"), /origem/);
  assert.throws(() => mapearCardRio(card.replace(">AP123<", "><"), configured, "venda"), /sem codigo/);
  assert.throws(() => projetoKenlo(project, "aluguel"), /Negociacao/);
  assert.throws(() => projetoKenlo({ ...project, urlVendas: project.urlLocacao }, "venda"), /nao suportada/);
});

test("card misto usa preco da finalidade correta e links canonicos", () => {
  const html = card.replace('<p class="card-with-buttons__value">R$ 850.000,50</p>',
    '<div class="card-with-buttons__value-container"><p class="card-with-buttons__value-title">Aluguel</p><p class="card-with-buttons__value">R$ 2.500</p></div>' +
    '<div class="card-with-buttons__value-container"><p class="card-with-buttons__value-title">Venda</p><p class="card-with-buttons__value">R$ 850.000,50</p></div>')
    .replace('/imovel/apartamento-rio/AP123"', '/imovel/apartamento-rio/AP123?from=sale#foto"');
  const sale = mapearCardRio(html, projetoKenlo(project, "venda"), "venda");
  assert.equal(sale.preco, 850000.5);
  assert.equal(mapearCardRio(html, projetoKenlo(project, "locacao"), "locacao").preco, 2500);
  assert.equal(new URL(sale.linkReal).search, "");
  assert.equal(new URL(sale.linkReal).hash, "");
  assert.equal(sale.linkReal, sale.linkCard);
});

function fakeBrowser(snapshot) {
  let current;
  let closed = 0;
  return {
    closed: () => closed,
    newPage: async () => ({
      goto: async url => { current = url; return { ok: () => true, status: () => 200 }; },
      url: () => current, evaluate: async () => snapshot,
      close: async () => { closed++; },
    }),
  };
}

test("check valida total atual e nao aceita cards com contador zero", async () => {
  const snapshot = { heading: "1 Imovel a venda", cards: [{ html: card }], text: "" };
  const browser = fakeBrowser(snapshot);
  assert.equal((await coletarKenloRio(browser, project, "venda", { totalEsperado: 1, primeiraPagina: true })).length, 1);
  assert.equal(browser.closed(), 1);
  await assert.rejects(coletarKenloRio(fakeBrowser(snapshot), project, "venda", { totalEsperado: 2, primeiraPagina: true }), /Total alterado/);
  await assert.rejects(coletarKenloRio(fakeBrowser(snapshot), project, "venda", { totalEsperado: 0 }), /Total alterado/);
});
