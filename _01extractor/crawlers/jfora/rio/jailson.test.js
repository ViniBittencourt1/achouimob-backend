import assert from "node:assert/strict";
import { test } from "node:test";
import { parseIndiceJailson } from "./jailson.js";

const row = overrides => ({
  id: "123", slug: "apartamento-2-quartos-em-vila-da-penha", code: "VPAP123",
  title: "Apartamento à venda Rua A, Vila da Penha, Rio de Janeiro - R$ 450.000",
  typeLabel: "Apartamento", type: "Apartamento", neighborhood: "Vila da Penha",
  street: "Rua A", priceSale: 450000, priceRent: null, priceDaily: null,
  bedrooms: 2, parking: 1, areaUsable: 70, img: "https://example.com/photo.jpg",
  ...overrides,
});

test("mapeia venda e aluguel com identidade de link e finalidade corretas", () => {
  const now = new Date("2026-11-19T13:00:00.000Z");
  const data = [
    row({}),
    row({
      id: "124", slug: "apartamento-2-quartos-em-vila-da-penha",
      code: "VPAP123", title: "Apartamento para alugar", priceSale: null, priceRent: 2600,
    }),
    row({ id: "125", slug: "terreno-no-meier", priceSale: 0, priceRent: null }),
  ];
  const venda = parseIndiceJailson(data, "venda", now);
  const aluguel = parseIndiceJailson(data, "locacao", now);
  assert.equal(venda.length, 1);
  assert.equal(venda[0].linkReal, "https://jaylsonimobiliaria.com.br/imovel/apartamento-2-quartos-em-vila-da-penha");
  assert.equal(venda[0].preco, 450000);
  assert.equal(venda[0].cidade, "rio-de-janeiro-rj");
  assert.equal(venda[0].bairro, "vila-da-penha");
  assert.equal(aluguel.length, 1);
  assert.equal(aluguel[0].linkReal, "https://jaylsonimobiliaria.com.br/imovel/apartamento-2-quartos-em-vila-da-penha?negocio=aluguel");
  assert.equal(aluguel[0].preco, 2600);
  assert.notEqual(venda[0].linkReal, aluguel[0].linkReal);
});

test("valida o índice e limita CHECK parcial aos primeiros 24 imóveis", () => {
  const records = Array.from({ length: 25 }, (_, index) => row({
    id: String(index + 1), slug: `imovel-${index + 1}`, code: `COD${index + 1}`,
  }));
  assert.equal(parseIndiceJailson(records, "venda", new Date(), true).length, 24);
  assert.throws(() => parseIndiceJailson([row({}), row({})], "venda"), /identificador repetido/);
  assert.throws(() => parseIndiceJailson([row({}), row({ id: "456" })], "venda"), /Links repetidos/);
  assert.throws(() => parseIndiceJailson([row({ code: "" })], "venda"), /incompleto/);
});
