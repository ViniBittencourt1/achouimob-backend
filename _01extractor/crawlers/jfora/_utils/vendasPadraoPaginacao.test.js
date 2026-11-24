import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { coletarVendasPadrao, rotaVendasPadrao } from './vendasPadraoPaginacao.js';

const projects = ['jfAlmar', 'jfBargon', 'jfCasaNova', 'jfClientt', 'jfEuro', 'jfLocato', 'jfMarques', 'jfNegociar', 'jfRibeiroArrabal', 'jfUniversal', 'jfRezende'];
const card = code => `<div class="imovel-item"><a href="/imovel/casa--venda--cod-${code}">Casa</a></div>`;

for (const project of projects) test(`${project}: rota usa vendas sem faixas de preco`, () => {
  const url = new URL(rotaVendasPadrao(project));
  assert.equal(url.searchParams.get('negociacao'), 'venda');
  assert.equal(url.searchParams.has('preco_min'), false);
  assert.equal(url.searchParams.has('preco_max'), false);
});

test('coleta paginas HTML completas e unicas sem depender do DOM do botao', async () => {
  const url = rotaVendasPadrao('jfAlmar');
  const page = {
    url: () => url,
    content: async () => `<span id="title--label">Imoveis (3)</span>${card(1)}${card(2)}`,
    evaluate: async (_callback, destination) => ({ status: 200, url: destination, html: card(2) + card(3) }),
  };
  assert.equal((await coletarVendasPadrao(page, url, 3)).length, 3);
});

test('mudanca de total, pagina repetida e HTTP invalido preservam base', async () => {
  const url = rotaVendasPadrao('jfAlmar');
  const page = { url: () => url, content: async () => `<span id="title--label">(3)</span>${card(1)}`, evaluate: async (_callback, destination) => ({ status: 200, url: destination, html: card(1) }) };
  await assert.rejects(coletarVendasPadrao(page, url, 4), /Total mudou/);
  await assert.rejects(coletarVendasPadrao(page, url, 3), /sem progresso/);
  page.evaluate = async (_callback, destination) => ({ status: 503, url: destination, html: '' });
  await assert.rejects(coletarVendasPadrao(page, url, 3), /HTTP 503/);
});

for (const project of projects) test(`${project}: integracao exige total e preserva caminho de alugueis`, async () => {
  const { projetoContagemVendas } = await import('./vendasContagemProjetos.js');
  const folder = projetoContagemVendas(project).folder;
  const index = fs.readFileSync(new URL(`../${folder}/index.js`, import.meta.url), 'utf8');
  const extractor = fs.readFileSync(new URL(`../${folder}/extractor.js`, import.meta.url), 'utf8');
  assert.ok(index.includes('linksBusca = [rotaVendasPadrao(COLLECTION_NAME)]'));
  assert.ok(index.includes('totalEsperado: totalDisponivelVendas'));
  assert.ok(extractor.includes('options.totalEsperado === undefined'));
  assert.ok(extractor.includes('coletarVendasPadrao(page, link, options.totalEsperado)'));
  assert.ok(extractor.includes('allImoveis.length !== options.totalEsperado'));
  assert.ok(extractor.includes(folder === 'universal' ? ': await page.$$eval(' : ': await page.$$('));
});