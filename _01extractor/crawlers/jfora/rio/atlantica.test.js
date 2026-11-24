import assert from "node:assert/strict";
import { test } from "node:test";
import { coletarAtlantica, contarAtlantica, parseCardAtlantica, validarUrlAtlantica } from "./atlantica.js";
import { getProjetoRio } from "./projects.js";

const project = getProjetoRio("rioAtlantica");

function card(code, negociacao = "venda") {
  const finalidade = negociacao === "venda" ? "à venda" : "para alugar";
  const price = negociacao === "venda" ? "R$ 420.000,00" : "R$ 2.700,00";
  return `<a href="https://www.atlanticaimoveis.com/imovel/casa-${code}/${code}">
    <img class="img-imovel" src="https://cdn.example.com/${code}.jpg">
    <div class="card-body">
      <span class="card-text">Jardim Mariléa | Rio das Ostras</span>
      <h2 class="card-title">Casa ${finalidade} no Jardim Mariléa</h2>
      <strong class="preco-imovel-card">${price}</strong>
    </div>
    <div class="card-footer">
      <div class="container-icon">70,00 m²</div>
      <div class="container-icon">2 Quarto(s)</div>
      <div class="container-icon">1 Vaga(s)</div>
      <div class="container-icon">3 Banho(s)</div>
    </div>
  </a>`;
}

function pageHtml(page, total, negociacao = "venda") {
  const first = (page - 1) * 20 + 1;
  const count = Math.min(20, Math.max(0, total - first + 1));
  const heading = negociacao === "venda"
    ? `${total} Imóveis à venda em Rio das Ostras, Macaé e Região`
    : `${total} Imóveis para alugar em Rio das Ostras, Macaé e Região`;
  return `<h1>${heading}</h1><div id="container-resultado-busca">${Array.from(
    { length: count }, (_, index) => card(first + index, negociacao),
  ).join("")}</div>`;
}

function browserFor(total, negociacao = "venda") {
  const visited = [];
  let currentUrl;
  let closed = false;
  const page = {
    goto: async url => {
      currentUrl = url;
      visited.push(new URL(url).searchParams.get("pagina"));
      return { ok: () => true, status: () => 200 };
    },
    url: () => currentUrl,
    waitForFunction: async () => {},
    content: async () => pageHtml(Number(new URL(currentUrl).searchParams.get("pagina")), total, negociacao),
    close: async () => { closed = true; },
  };
  return { browser: { newPage: async () => page }, visited, closed: () => closed };
}

test("mapeia card de venda e aluguel com campos da base e rejeita finalidade divergente", () => {
  const sale = parseCardAtlantica(card(13312), project, "venda", new Date("2026-11-17T12:00:00Z"));
  assert.equal(sale.codigoBase, "13312");
  assert.equal(sale.preco, 420000);
  assert.equal(sale.areaValor, 70);
  assert.equal(sale.dormitorioValor, 2);
  assert.equal(sale.banheiroValor, 3);
  assert.equal(sale.garagemValor, 1);
  assert.equal(sale.bairro, "jardim-marilea");
  assert.equal(sale.cidade, "rio-das-ostras-rj");
  assert.equal(sale.linkFoto, "https://cdn.example.com/13312.jpg");
  assert.equal(sale.dataInclusao, "2026-11-17T12:00:00.000Z");

  const rental = parseCardAtlantica(card(13311, "locacao"), project, "locacao");
  assert.equal(rental.preco, 2700);
  assert.equal(rental.linkReal, "https://www.atlanticaimoveis.com/imovel/casa-13311/13311");
  assert.throws(() => parseCardAtlantica(card(13312, "locacao"), project, "venda"), /Titulo ou finalidade invalidos/);
  assert.throws(() => parseCardAtlantica(card(13312).replace("420.000,00", "indisponivel"), project, "venda"), /Preco ausente ou invalido/);
});

test("valida origem e finalidade da URL antes de consultar paginas", () => {
  assert.equal(validarUrlAtlantica(project.urlVendas, project, "venda", 1), project.urlVendas);
  assert.equal(validarUrlAtlantica(project.urlLocacao, project, "locacao", 1), project.urlLocacao);
  for (const [url, negociacao] of [
    ["https://example.com/venda/?pagina=1", "venda"],
    [project.urlVendas, "locacao"],
    ["https://www.atlanticaimoveis.com/aluguel/?pagina=0", "locacao"],
    ["https://www.atlanticaimoveis.com/venda/?pagina=1&redirect=https://example.com", "venda"],
  ]) assert.throws(() => validarUrlAtlantica(url, project, negociacao));
});

test("conta e coleta todas as paginas, preservando total e exigindo a pagina completa", async () => {
  const countFixture = browserFor(21);
  assert.equal(await contarAtlantica(countFixture.browser, project, "venda"), 21);
  assert.equal(countFixture.closed(), true);

  const collectFixture = browserFor(21);
  const records = await coletarAtlantica(collectFixture.browser, project, "venda", { totalEsperado: 21 });
  assert.equal(records.length, 21);
  assert.deepEqual(collectFixture.visited, ["1", "2"]);
  assert.equal(collectFixture.closed(), true);

  const partialFixture = browserFor(21);
  const partial = await coletarAtlantica(partialFixture.browser, project, "venda", {
    totalEsperado: 21, primeiraPagina: true,
  });
  assert.equal(partial.length, 20);
  assert.deepEqual(partialFixture.visited, ["1"]);

  const changedFixture = browserFor(20);
  await assert.rejects(coletarAtlantica(changedFixture.browser, project, "venda", { totalEsperado: 21 }), /Total alterado na pagina 1/);
});

test("rejeita lista com total inconsistente e nunca retorna coleta aparentemente completa", async () => {
  const fixture = browserFor(20, "locacao");
  await assert.rejects(coletarAtlantica(fixture.browser, project, "venda", { totalEsperado: 20 }), /Total ou finalidade invalidos/);
});
