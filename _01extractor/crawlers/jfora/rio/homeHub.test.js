import assert from "node:assert/strict";
import { test } from "node:test";
import { coletarHomeHub, contarHomeHub, mapearHomeHub, validarUrlHomeHub } from "./homeHub.js";
import { getProjetoRio } from "./projects.js";

const project = getProjetoRio("rioHomeHub");

function estate(code, negociacao = "venda") {
  return {
    code,
    active: true,
    agency: { name: "Agência HomeHub" },
    bedrooms: 2,
    category: { name: "Apartamento" },
    complete_address: "Rua Dias Ferreira - Leblon - Rio de Janeiro/RJ",
    estate_photos: [{ photo: "https://images.example.com/imovel.jpg" }],
    for_sale: negociacao === "venda",
    for_rent: negociacao === "locacao",
    parking: 1,
    rent_price: negociacao === "locacao" ? 3500 : null,
    sale_price: negociacao === "venda" ? 900000 : null,
    size: 85,
    social_bathrooms: 2,
    street: "Dias Ferreira",
    street_type: "Rua",
    subneighborhood: "Leblon",
  };
}

function listingPage(estates, currentPage, totalCount) {
  return {
    estates,
    pagination: {
      total_count: totalCount,
      total_pages: Math.ceil(totalCount / 15),
      current_page: currentPage,
      per_page: 15,
    },
  };
}

function urlFor(code, negociacao = "venda") {
  const route = negociacao === "venda" ? "venda" : "aluguel";
  return `https://homehub.com.br/imovel/${route}/apartamento-2-quartos-leblon-rio-de-janeiro-rj-brasil-85-m2-1-vaga/cod-${code}/homehub`;
}

test("valida rotas HomeHub e mapeia venda/aluguel para o esquema Rio", () => {
  assert.equal(validarUrlHomeHub(project.urlVendas, project, "venda"), project.urlVendas);
  assert.equal(validarUrlHomeHub(project.urlLocacao, project, "locacao"), project.urlLocacao);
  assert.throws(() => validarUrlHomeHub("https://example.com/venda", project, "venda"), /invalidas/);

  const sale = mapearHomeHub(estate(12027199), urlFor(12027199), project, "venda", new Date("2026-11-17T12:00:00Z"));
  assert.equal(sale.codigoBase, "12027199");
  assert.equal(sale.preco, 900000);
  assert.equal(sale.tipoImovel, "apartamento");
  assert.equal(sale.cidade, "rio-de-janeiro-rj");
  assert.equal(sale.bairro, "leblon");
  assert.equal(sale.areaValor, 85);
  assert.equal(sale.banheiroValor, 2);
  assert.equal(sale.garagemValor, 1);
  assert.equal(sale.linkFoto, "https://images.example.com/imovel.jpg");
  assert.equal(sale.dataInclusao, "2026-11-17T12:00:00.000Z");

  const rental = mapearHomeHub(estate(12027198, "locacao"), urlFor(12027198, "locacao"), project, "locacao");
  assert.equal(rental.preco, 3500);
  assert.equal(rental.linkReal, urlFor(12027198, "locacao"));
  assert.throws(() => mapearHomeHub(estate(12027198), urlFor(12027198), project, "locacao"), /fora dos filtros/);
  assert.throws(() => mapearHomeHub(estate(12027199), "https://example.com/imovel", project, "venda"), /Link fora/);
});

test("usa Barra da Tijuca como bairro e le o endereco sem converter objetos em texto", () => {
  const codigo = 12026626;
  const link = `https://homehub.com.br/imovel/venda/apartamento-3-quartos-jardim-oceanico-barra-da-tijuca-rio-de-janeiro-rj-brasil-160-m2-2-vagas/cod-${codigo}/homehub-olegario`;
  const dados = {
    ...estate(codigo),
    complete_address: "Rua Pedro Bolato - Barra da Tijuca - Rio de Janeiro/RJ",
    street: { name: "Pedro Bolato", neighborhood: { name: "Barra da Tijuca", city: { name: "Rio de Janeiro" } } },
    street_type: { name: "Rua" },
    subneighborhood: { name: "Jardim Oceânico" },
  };
  for (const complete_address of [dados.complete_address, null]) {
    const mapped = mapearHomeHub({ ...dados, complete_address }, link, project, "venda");
    assert.equal(mapped.bairro, "barra-da-tijuca");
    assert.equal(mapped.titulo, "Apartamento a venda - Barra da Tijuca, Rio de Janeiro");
    assert.equal(mapped.localizacao, "Rua Pedro Bolato, Barra da Tijuca, Rio de Janeiro - RJ");
  }
  const linkOnly = mapearHomeHub({
    ...dados, complete_address: "", street: { id: 521 }, address_name: {}, street_type: {},
  }, link, project, "venda");
  assert.equal(linkOnly.bairro, "barra-da-tijuca");
  assert.equal(linkOnly.localizacao, "Barra da Tijuca, Rio de Janeiro - RJ");
});

test("nao usa um bairro de outra parte do slug ou da agencia como fallback", () => {
  const link = "https://homehub.com.br/imovel/aluguel/apartamento-leblon-desconhecido-rio-de-janeiro-rj-brasil-85-m2/cod-1/ipanema";
  const dados = { ...estate(1, "locacao"), complete_address: null, subneighborhood: {} };
  assert.throws(() => mapearHomeHub(dados, link, project, "locacao"), /Bairro nao identificado: 1/);
});

test("conta consultando a API e falha em respostas incompletas ou inconsistentes", async () => {
  const request = async (url, options) => {
    assert.match(url, /for_sale=true/);
    assert.match(url, /city_id%5B%5D=5/);
    assert.ok(options.signal);
    return { ok: true, json: async () => listingPage([estate(12027199)], 1, 1) };
  };
  assert.equal(await contarHomeHub(null, project, "venda", { request }), 1);
  await assert.rejects(contarHomeHub(null, project, "locacao", {
    request: async () => ({ ok: true, json: async () => listingPage([], 1, 1) }),
  }), /Resposta ou paginacao invalida/);
  await assert.rejects(contarHomeHub(null, project, "venda", {
    request: async () => ({ ok: false, status: 503 }),
  }), /HTTP 503/);
});

test("coleta lotes paginados e valida os links renderizados sem incluir cards extras", async () => {
  const firstEstates = Array.from({ length: 15 }, (_, index) => estate(String(12027000 + index)));
  const lastEstate = estate("12027015");
  const lastPage = listingPage([lastEstate], 2, 16);
  const rendered = [];
  let pageNumber = 1;
  let closed = false;
  const page = {
    goto: async () => ({ ok: () => true }),
    url: () => project.urlVendas,
    waitForResponse: async () => ({ ok: () => true, json: async () => lastPage }),
    $$: async () => [{
      evaluate: async getState => getState({
        textContent: "Carregar mais imóveis",
        disabled: false,
        getClientRects: () => [{}],
      }),
      click: async () => {
        pageNumber = 2;
        rendered.push({ href: urlFor(lastEstate.code), codigo: lastEstate.code });
      },
    }],
    $$eval: async (_selector, mapper) => mapper(rendered),
    waitForFunction: async () => {},
    close: async () => { closed = true; },
  };
  const browser = { newPage: async () => page };
  rendered.push(...firstEstates.map(item => ({ href: urlFor(item.code), codigo: item.code })));
  const records = await coletarHomeHub(browser, project, "venda", {
    totalEsperado: 16,
    request: async () => ({ ok: true, json: async () => listingPage(firstEstates, 1, 16) }),
  });
  assert.equal(records.length, 16);
  assert.equal(records[0].codigoBase, firstEstates[0].code);
  assert.equal(records.at(-1).codigoBase, lastEstate.code);
  assert.equal(pageNumber, 2);
  assert.equal(closed, true);

  closed = false;
  await assert.rejects(coletarHomeHub(browser, project, "venda", {
    totalEsperado: 17,
    request: async () => ({ ok: true, json: async () => listingPage(firstEstates, 1, 17) }),
  }), { code: "HOMEHUB_TOTAL_ALTERADO", message: /pagina 2: 17 -> 16/ });
  assert.equal(closed, true);
});

test("CHECK de coleta parcial limita HomeHub ao primeiro lote", async () => {
  const firstEstates = Array.from({ length: 15 }, (_, index) => estate(String(12028000 + index)));
  const rendered = firstEstates.map(item => ({ href: urlFor(item.code), codigo: item.code }));
  const page = {
    goto: async () => ({ ok: () => true }),
    url: () => project.urlVendas,
    $$eval: async (_selector, mapper) => mapper(rendered),
    waitForFunction: async () => {},
    close: async () => {},
  };
  const records = await coletarHomeHub({ newPage: async () => page }, project, "venda", {
    totalEsperado: 20,
    primeiraPagina: true,
    request: async () => ({ ok: true, json: async () => listingPage(firstEstates, 1, 20) }),
  });
  assert.equal(records.length, 15);
});
