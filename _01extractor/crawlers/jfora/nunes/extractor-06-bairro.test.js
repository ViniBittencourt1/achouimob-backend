import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractBairroFromBreadcrumb, extractBairroFromHeaderTitle, extractBairroFromLocalizacao, extractLocalizacao } from './extractor-06-bairrojs.js';

const card = bairro => `<h2 class="card-with-buttons__heading">${bairro} - Juiz de Fora - MG</h2>`;

test('bairro parcial resolve para o bairro principal mais específico da mesma cidade', () => {
  assert.equal(extractLocalizacao(card('Laranjeiras'), 'juiz-de-fora-mg'), 'jardim-laranjeiras');
});

test('bairro homônimo resolve conforme a cidade, sem reaproveitar slug de outra cidade', () => {
  assert.equal(extractLocalizacao(card('Laranjeiras'), 'rio-de-janeiro-rj'), 'laranjeiras');
});

test('match de bairro permanece normalizado para acentos e caixa', () => {
  assert.equal(extractLocalizacao(card('São Pedro'), 'juiz-de-fora-mg'), 'sao-pedro');
});

test('nome de empreendimento sem bairro no catálogo não é salvo como bairro', () => {
  assert.equal(extractLocalizacao(card('Flow, Studios, 27 m²'), 'juiz-de-fora-mg'), '');
});

test('título de empreendimento extrai o bairro entre nome do projeto e cidade', () => {
  const title = 'Estrela do Vale - Santa Cruz - Juiz de Fora/MG';
  assert.equal(extractBairroFromHeaderTitle(title, 'juiz-de-fora-mg'), 'santa-cruz');
  assert.equal(extractLocalizacao(`<div class="header-title"><span>${title}</span></div>`, 'juiz-de-fora-mg'), 'santa-cruz');
});

test('título de empreendimento não atribui bairro quando a cidade não coincide', () => {
  const title = 'Estrela do Vale - Santa Cruz - Juiz de Fora/MG';
  assert.equal(extractBairroFromHeaderTitle(title, 'matias-barbosa-mg'), '');
});

test('localização do detalhe resolve bairro separado da cidade e valida a cidade', () => {
  assert.equal(extractBairroFromLocalizacao('Santa Cruz - Juiz de Fora/MG', 'juiz-de-fora-mg'), 'santa-cruz');
  assert.equal(extractBairroFromLocalizacao('Santa Cruz - Juiz de Fora/MG', 'matias-barbosa-mg'), '');
});

test('breadcrumb Nunes resolve o item após a cidade sem confundir empreendimento e bairro', () => {
  const html = '<ol><li class="item-breadcrumb item-breadcrumb4"><a href="/imoveis/novos/juiz-de-fora">Juiz de Fora</a></li><li class="item-breadcrumb item-breadcrumb5"><a href="/imoveis/novos/juiz-de-fora/bom-pastor">Bom Pastor</a></li><li class="item-breadcrumb item-breadcrumb-last">Imóvel 24028889-NUNO</li></ol>';
  assert.equal(extractBairroFromBreadcrumb(html, 'juiz-de-fora-mg'), 'bom-pastor');
  assert.equal(extractBairroFromBreadcrumb(html, 'matias-barbosa-mg'), '');
});