import assert from "node:assert/strict";
import { test } from "node:test";
import { resolverBairroNiteroi, resolverBairroNiteroiDoLink } from "./bairro.js";
import { parseNiteroiCard } from "./extractor.js";

test("bairro usa nomes, aliases e slugs da mesma cidade sem correspondencias parciais", () => {
  const catalogo = [
    { nome: "Icaraí", slug: "icarai", cidade: "niteroi-rj", principal: "sim" },
    { nome: "Nome alternativo", slug: "icarai", cidade: "niteroi-rj", principal: "nao" },
    { nome: "Icaraí", slug: "outro-bairro", cidade: "outra-cidade-rj" },
    { nome: "Ambiguo", slug: "primeiro", cidade: "niteroi-rj" },
    { nome: "Ambiguo", slug: "segundo", cidade: "niteroi-rj" },
  ];
  for (const nome of ["Icaraí", " ICARAI ", "icarai", "Nome alternativo"]) {
    assert.equal(resolverBairroNiteroi(nome, "niteroi-rj", catalogo), "icarai");
  }
  for (const nome of ["", "Icaraí Novo", "Nome desconhecido", "Ambiguo"]) {
    assert.equal(resolverBairroNiteroi(nome, "niteroi-rj", catalogo), "");
  }
  assert.equal(resolverBairroNiteroi("Icaraí", "sem-cidade", catalogo), "");
  assert.equal(resolverBairroNiteroi("Icaraí", "", catalogo), "");
});

test("bairro do link exige palavras completas, cidade correta e slug unico", () => {
  const catalogo = [
    { nome: "Charitas", slug: "charitas", cidade: "niteroi-rj" },
    { nome: "Charitas", slug: "charitas", cidade: "niteroi-rj", principal: "nao" },
    { nome: "Icaraí", slug: "icarai", cidade: "niteroi-rj" },
    { nome: "Niterói", slug: "niteroi", cidade: "niteroi-rj" },
  ];
  const resolver = (path, cidade = "niteroi-rj") =>
    resolverBairroNiteroiDoLink(`https://example.com${path}`, cidade, catalogo);
  assert.equal(resolver("/empreendimento/sou-wellness-charitas-apartamentos-niteroi/24480528-PCCO?from=sale"), "charitas");
  assert.equal(resolver("/imovel/apartamento-icara%C3%AD/AP1"), "icarai");
  assert.equal(resolver("/imovel/apartamento-charitas/AP1", "outra-cidade-rj"), "");
  assert.equal(resolver("/imovel/apartamento-charitas/AP1", ""), "");
  assert.equal(resolver("/imovel/apartamento-charitasnovo/AP1"), "");
  assert.equal(resolver("/imovel/apartamento-icarai-charitas/AP1"), "");
  assert.equal(resolver("/imovel/apartamento/AP1?bairro=charitas"), "");
  assert.equal(resolver("/imovel/apartamento-niteroi/AP1"), "");
  assert.equal(resolver("/imovel/apartamento/charitas"), "");
  assert.equal(resolver("/outra-rota/charitas/AP1"), "");
});

test("nitNova recupera Charitas do link do empreendimento sem alterar os demais campos", () => {
  const link = "/empreendimento/sou-wellness-charitas-apartamentos-e-apartamentos-garden-niteroi-1-a-2-quartos-39-a-124-m/24480528-PCCO?from=sale";
  const html = `<a class="card-with-buttons" href="${link}">
    <h2 class="card-with-buttons__heading">Sou+ Wellness Charitas, com 1 a 2 quartos, 39 a 124 m²</h2>
    <img class="cards_digital_carousel-image" alt="Sou+ Wellness Charitas, Niterói - RJ"></a>`;
  const options = { baseUrl: "https://www.novaimobiliaria.imb.br", displayName: "Nova Imobiliária", now: new Date("2026-10-16T12:00:00Z") };
  const original = parseNiteroiCard(html, options);
  assert.equal(original.cidade, "niteroi-rj");
  assert.equal(original.bairro, "");
  assert.deepEqual(parseNiteroiCard(html, { ...options, projectName: "nitNova" }), { ...original, bairro: "charitas", tipoImovel: "apartamento" });
  const card = `<a class="card-with-buttons" href="${link}">
    <h2 class="card-with-buttons__heading">Icaraí - Niterói - RJ</h2></a>`.replace("/empreendimento/", "/imovel/");
  assert.equal(parseNiteroiCard(card, { ...options, projectName: "nitNova" }).bairro, "icarai");
  assert.equal(parseNiteroiCard(card.replace("Icaraí -", "Bairro desconhecido -"), { ...options, projectName: "nitNova" }).bairro, "charitas");
});

for (const projectName of ["nitImob2000", "nitLopes", "nitFlora", "nitNova"]) {
test(`${projectName} grava slug sem alterar localizacao, titulo ou outros projetos`, () => {
  const html = `<a class="card-with-buttons" href="/imovel/apartamento/AP1">
    <p class="card-with-buttons__title">Apartamento</p>
    <h2 class="card-with-buttons__heading">Icaraí - Niterói - RJ</h2>
    <p class="card-with-buttons__value">R$ 850.000</p></a>`;
  const options = { baseUrl: "https://www.imob2000.com.br", displayName: "Imob 2000", now: new Date("2026-10-15T12:00:00Z") };
  const original = parseNiteroiCard(html, options);
  const result = parseNiteroiCard(html, { ...options, projectName });
  assert.deepEqual(result, { ...original, bairro: "icarai" });
  const desconhecido = html.replace("Icaraí", "Bairro inexistente para teste");
  const warnings = [];
  const warn = console.warn;
  console.warn = message => warnings.push(message);
  try {
    assert.equal(parseNiteroiCard(desconhecido, { ...options, projectName }).bairro, "Bairro inexistente para teste");
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].startsWith(`[${projectName}] Bairro sem correspondencia`));
    assert.equal(parseNiteroiCard(html.replace("Icaraí - Niterói - RJ", ""), { ...options, projectName }).bairro, "");
  } finally { console.warn = warn; }
});
}
