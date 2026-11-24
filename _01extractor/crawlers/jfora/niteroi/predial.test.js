import assert from "node:assert/strict";
import { test } from "node:test";
import { contar, coletar, coletarVendas, parsePredialCard, readSnapshotPredial } from "./predial.js";

const card = (code, { purpose = "venda", price = "R$ 660.000", rent = "" } = {}) => `
<article class="cartao imovel-cartao" data-imovel-codigo="${code}">
  <div class="cartao-imagem"><img src="/fotos/${code}.jpg"></div>
  <div class="corpo">
    <span class="topo-cartao"><span>Apartamento em Icaraí</span><span class="codigo-imovel">${code}</span></span>
    <h3><a href="/imoveis/apartamento-${code}">Apartamento com 2 quartos ${purpose === "venda" ? "à venda" : "para alugar"}</a></h3>
    <p class="cartao-endereco">Rua Exemplo · Icaraí · Niterói · RJ</p>
    <span class="fatos"><span>2 quartos</span><span>80 m²</span><span>1 vaga</span><span>2 banheiros</span></span>
    <span class="preco">${price}</span>${rent}
  </div>
</article>`;

function listing({ finalidade = "venda", pagina = 1, cards, total = 2 }) {
  const pages = Array.from({ length: Math.ceil(total / 2) }, (_, index) =>
    `<a href="/imoveis?finalidade=${finalidade}&pagina=${index + 1}">${index + 1}</a>`,
  ).join("");
  return `<html><body><h1>Imóveis ${finalidade === "venda" ? "à venda" : "para alugar"} em Niterói</h1>
    <p>${total} imóveis encontrados</p>${cards.join("")}<nav>${pages}</nav></body></html>`;
}

function browserForPages(pages) {
  let currentUrl = "";
  const page = {
    goto: async url => { currentUrl = url; return { ok: () => true, status: () => 200 }; },
    url: () => currentUrl,
    waitForFunction: async () => {},
    content: async () => pages[new URL(currentUrl).searchParams.get("pagina") || "1"],
    close: async () => {},
  };
  return { newPage: async () => page };
}

test("mapeia card Predial em venda e aluguel com campos catalogaveis", () => {
  const sale = parsePredialCard(card("AP-1"), "venda", new Date("2026-01-01T00:00:00Z"));
  assert.equal(sale.codigoBase, "AP-1");
  assert.equal(sale.preco, 660000);
  assert.equal(sale.cidade, "niteroi-rj");
  assert.equal(sale.areaValor, 80);
  assert.equal(sale.linkFoto, "https://www.predialimobiliaria.com/fotos/AP-1.jpg");

  const rent = parsePredialCard(card("AP-2", {
    purpose: "locacao", price: "R$ 5.345 por mês, total",
    rent: "<p>Aluguel R$ 4.000 + condomínio R$ 1.140 + IPTU R$ 205</p>",
  }), "locacao");
  assert.equal(rent.preco, 4000);
});

test("recupera bairro e cidade pelo titulo quando o card nao oferece endereco", () => {
  const html = card("AP-SEM-ENDERECO")
    .replace("Apartamento com 2 quartos à venda", "Apartamento com 3 quartos, 130 m², à venda - Icaraí, Niterói/RJ")
    .replace(/<p class="cartao-endereco">.*?<\/p>/, "");
  const record = parsePredialCard(html, "venda");
  assert.equal(record.bairro, "icarai");
  assert.equal(record.cidade, "niteroi-rj");
  assert.equal(record.localizacao, "Icaraí · Niterói · RJ");
});

test("prioriza Niteroi no link e nao confunde bairro com municipio homonimo", () => {
  const html = card("AP-1")
    .replace("/imoveis/apartamento-AP-1", "/imoveis/apartamento-sao-francisco-niter%C3%B3i-rj-AP-1")
    .replace("Rua Exemplo · Icaraí · Niterói · RJ", "Rua Tocantins · São Francisco · Niterói · RJ");
  for (const negociacao of ["venda", "locacao"]) {
    const record = parsePredialCard(html, negociacao);
    assert.equal(record.cidade, "niteroi-rj");
    assert.equal(record.bairro, "sao-francisco");
  }
});

test("mantem a cidade do endereco se Niteroi aparece apenas na consulta do link", () => {
  const html = card("AP-1")
    .replace("/imoveis/apartamento-AP-1", "/imoveis/apartamento-neves-sao-goncalo-rj-AP-1?origem=niteroi")
    .replace("Rua Exemplo · Icaraí · Niterói · RJ", "Rua Exemplo · Neves · São Gonçalo · RJ");
  const record = parsePredialCard(html, "venda");
  assert.equal(record.cidade, "sao-goncalo-rj");
  assert.equal(record.bairro, "neves");
});

test("extrai total, links de pagina e preserva finalidade da busca", () => {
  const snapshot = readSnapshotPredial(listing({
    cards: [card("AP-1")], total: 3,
  }), "https://www.predialimobiliaria.com/imoveis?finalidade=venda");
  assert.equal(snapshot.total, 3);
  assert.equal(snapshot.cards.length, 1);
  assert.equal(snapshot.maxPage, 2);
});

test("conta aluguel e percorre todas as paginas com validacao do total", async () => {
  const pages = {
    "1": listing({ finalidade: "aluguel", cards: [card("AP-1", { purpose: "locacao" }), card("AP-2", { purpose: "locacao" })], total: 3 }),
    "2": listing({ finalidade: "aluguel", pagina: 2, cards: [card("AP-3", { purpose: "locacao" })], total: 3 }),
  };
  const project = { collection: "nitPredial", url: "https://www.predialimobiliaria.com/imoveis?finalidade=aluguel" };
  assert.equal(await contar(browserForPages(pages), project), 3);
  const records = await coletar(browserForPages(pages), project, { totalEsperado: 3 });
  assert.deepEqual(records.map(item => item.codigoBase), ["AP-1", "AP-2", "AP-3"]);
});

test("sales collector rejects counts that drift before returning data", async () => {
  const pages = {
    "1": listing({ cards: [card("AP-1"), card("AP-2")], total: 3 }),
    "2": listing({ pagina: 2, cards: [card("AP-3")], total: 4 }),
  };
  await assert.rejects(coletarVendas(browserForPages(pages), {
    collection: "nitPredial", url: "https://www.predialimobiliaria.com/imoveis?finalidade=venda",
  }, { totalEsperado: 3 }), error => error.code === "KENLO_TOTAL_ALTERADO");
});
