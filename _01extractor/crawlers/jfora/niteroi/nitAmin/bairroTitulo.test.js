import assert from "node:assert/strict";
import { test } from "node:test";
import { extrairCandidatoBairroDoTitulo, resolverBairroDoTitulo } from "./bairroTitulo.js";
import { parseNiteroiCard } from "../extractor.js";

const catalogo = [
  { nome: "Icarai", slug: "icarai", cidade: "niteroi-rj", principal: "sim" },
  { nome: "Jardim Icarai", slug: "jardim-icarai", cidade: "niteroi-rj", principal: "nao" },
  { nome: "Ile", slug: "ile", cidade: "outra-rj", principal: "sim" },
];

test("extrai o candidato antes dos detalhes e prefere Jardim Icarai a Icarai", () => {
  assert.equal(extrairCandidatoBairroDoTitulo("em Solo Jardim Icaraí"), "Solo Jardim Icaraí");
  assert.equal(resolverBairroDoTitulo("em Solo Jardim Icaraí", "niteroi-rj", catalogo), "jardim-icarai");
});

test("extrai Ile mas so preenche se cadastrado na mesma cidade", () => {
  const titulo = "Apartamento em Ilê, apartamentos com 1 a 2 quartos, 42 a 102 m²";
  assert.equal(extrairCandidatoBairroDoTitulo(titulo), "Ilê");
  assert.equal(resolverBairroDoTitulo(titulo, "niteroi-rj", catalogo), "");
  assert.equal(resolverBairroDoTitulo(titulo, "outra-rj", catalogo), "ile");
});

test("nao aceita fragmentos, detalhes depois da virgula ou cidades vazias", () => {
  assert.equal(resolverBairroDoTitulo("em Supericarai", "niteroi-rj", catalogo), "");
  assert.equal(resolverBairroDoTitulo("em Ilê, perto de Icaraí", "niteroi-rj", catalogo), "");
  assert.equal(resolverBairroDoTitulo("em Icaraí", "", catalogo), "");
  assert.equal(resolverBairroDoTitulo("", "niteroi-rj", catalogo), "");
});

test("mantem vazio quando ha destinos ambiguos", () => {
  assert.equal(resolverBairroDoTitulo("em Icaraí", "niteroi-rj", [
    ...catalogo, { nome: "Icarai", slug: "outro", cidade: "niteroi-rj" },
  ]), "");
  assert.equal(resolverBairroDoTitulo("em Icaraí e Centro", "niteroi-rj", [
    ...catalogo, { nome: "Centro", slug: "centro", cidade: "niteroi-rj" },
  ]), "");
});

test("fallback do card atende nitAmin e nitKiffer sem alterar outros projetos ou bairros preenchidos", () => {
  const html = `<a href="/empreendimento/solo/123">
    <h2 class="card-with-buttons__heading">Solo Jardim Icaraí</h2>
    <img class="cards_digital_carousel-image" alt="Solo Jardim Icaraí, Niterói - RJ">
  </a>`;
  const options = { baseUrl: "https://www.amimimoveis.com.br", displayName: "Amim" };
  assert.equal(parseNiteroiCard(html, { ...options, projectName: "nitAccioly" }).bairro, "");
  const desconhecido = html.replaceAll("Solo Jardim Icaraí", "Empreendimento Sem Cadastro Teste, apartamentos com 1 a 2 quartos");
  const regular = html.replace("/empreendimento/", "/imovel/").replace(
    ">Solo Jardim Icaraí</h2>", ">Outro Bairro - Niterói - RJ</h2>"
  );
  for (const projectName of ["nitAmin", "nitKiffer"]) {
    const projectOptions = { ...options, projectName };
    assert.equal(parseNiteroiCard(html, projectOptions).bairro, "jardim-icarai", projectName);
    assert.equal(parseNiteroiCard(desconhecido, projectOptions).bairro, "Empreendimento Sem Cadastro Teste", projectName);
    assert.equal(parseNiteroiCard(regular, projectOptions).bairro, "Outro Bairro", projectName);
    const withoutCity = html.replace(", Niterói - RJ", "");
    assert.equal(parseNiteroiCard(withoutCity, projectOptions).bairro, "Solo Jardim Icaraí", projectName);
    const withoutTitle = html.replace(">Solo Jardim Icaraí</h2>", "></h2>");
    assert.equal(parseNiteroiCard(withoutTitle, projectOptions).bairro, "", projectName);
  }
});
