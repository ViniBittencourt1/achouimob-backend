import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractBairroFromBreadcrumb, extractLocalizacao } from './extractor-06-bairrojs.js';

test('bairro do card é resolvido no catálogo da cidade', () => {
  assert.equal(extractLocalizacao('<h2 class="card-title">Catita</h2>', 'matias-barbosa-mg'), 'catita');
});

test('header-title fornece bairro entre o título do imóvel e a cidade quando o card não tem h2', () => {
  const html = '<div class="header-title hidden-lg-up"><span>Terreno à venda, 1285 m² por R$ 99.000,00 - Catita - Matias Barbosa/MG</span></div>';
  assert.equal(extractLocalizacao(html, 'matias-barbosa-mg'), 'catita');
});

test('bairro do header não é associado a outra cidade', () => {
  const html = '<div class="header-title"><span>Terreno à venda, 1285 m² - Catita - Matias Barbosa/MG</span></div>';
  assert.equal(extractLocalizacao(html, 'juiz-de-fora-mg'), '');
});

test('bairro no breadcrumb é o item imediatamente após a cidade e resolve no catálogo', () => {
  const html = '<ol><li class="item-breadcrumb item-breadcrumb5"><a href="/imoveis/a-venda/terreno/matias-barbosa">Matias Barbosa</a></li><li class="item-breadcrumb item-breadcrumb6"><a href="/imoveis/a-venda/terreno/matias-barbosa/rancho-de-matias">Rancho de Matias</a></li><li class="item-breadcrumb item-breadcrumb-last">Terreno à venda - Rancho de Matias - Matias Barbosa/MG</li></ol>';
  assert.equal(extractBairroFromBreadcrumb(html, 'matias-barbosa-mg'), 'rancho-de-matias');
});

test('breadcrumb completo da Leal resolve Mirim depois de Matias Barbosa', () => {
  const html = '<ol><li class="item-breadcrumb item-breadcrumb1"><a href="https://www.lealimoveismb.com.br" rel="follow">Home</a></li><li class="item-breadcrumb item-breadcrumb2"><a href="/imoveis" rel="follow">Imóveis</a></li><li class="item-breadcrumb item-breadcrumb3"><a href="/imoveis/a-venda" rel="follow">À venda</a></li><li class="item-breadcrumb item-breadcrumb4"><a href="/imoveis/a-venda/terreno" rel="follow">Terreno</a></li><li class="item-breadcrumb item-breadcrumb5"><a href="/imoveis/a-venda/terreno/matias-barbosa" rel="follow">Matias Barbosa</a></li><li class="item-breadcrumb item-breadcrumb6"><a href="/imoveis/a-venda/terreno/matias-barbosa/mirim" rel="follow">Mirim</a></li><li class="item-breadcrumb item-breadcrumb-last">Terreno à venda, 300 m² por R$ 65.000,00 - Mirim - Matias Barbosa/MG</li></ol>';
  assert.equal(extractBairroFromBreadcrumb(html, 'matias-barbosa-mg'), 'mirim');
  assert.equal(extractLocalizacao(html, 'matias-barbosa-mg'), 'mirim');
  assert.equal(extractBairroFromBreadcrumb(html, 'juiz-de-fora-mg'), '');
});

test('breadcrumb não usa bairro quando a cidade não corresponde ou não há item seguinte', () => {
  const breadcrumb = '<ol><li class="item-breadcrumb"><a href="/imoveis/a-venda/terreno/matias-barbosa">Matias Barbosa</a></li><li class="item-breadcrumb"><a href="/imoveis/a-venda/terreno/matias-barbosa/rancho-de-matias">Rancho de Matias</a></li><li class="item-breadcrumb item-breadcrumb-last">Terreno</li></ol>';
  const semBairro = '<ol><li class="item-breadcrumb"><a href="/imoveis/a-venda/terreno/matias-barbosa">Matias Barbosa</a></li><li class="item-breadcrumb item-breadcrumb-last">Terreno</li></ol>';
  assert.equal(extractBairroFromBreadcrumb(breadcrumb, 'juiz-de-fora-mg'), '');
  assert.equal(extractBairroFromBreadcrumb(semBairro, 'matias-barbosa-mg'), '');
});