import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coletarLocacaoPadrao } from '../_utils/locacaoPadraoPaginacao.js';
import { extractRibeiroArrabalData } from './extractor.js';

const url = 'https://ribeiroearrabal.com.br/imoveis?negociacao=locacao&order=recentes&preco_min=&preco_max=';
const card = code => `<div class="imovel-item"><a href="/imovel/casa--locacao--cod-${code}">Casa</a></div>`;

test('Ribeiro coleta 262 alugueis em 14 paginas com progresso sem clicar em botao', async () => {
  const requests = [];
  const html = number => Array.from({ length: Math.min(20, 262 - (number - 1) * 20) }, (_, index) => card((number - 1) * 20 + index)).join('');
  const page = {
    url: () => url,
    content: async () => `<span id="title--label">(262)</span>${html(1)}`,
    evaluate: async (_callback, destination) => {
      const next = new URL(destination);
      requests.push(next);
      assert.equal(next.searchParams.get('negociacao'), 'locacao');
      assert.equal(next.searchParams.get('tmpl'), 'imoveis/list_items');
      assert.equal(next.searchParams.get('order'), 'recentes');
      return { status: 200, url: destination, html: html(Number(next.searchParams.get('page'))) };
    },
    $: async () => assert.fail('Nao clicar no botao que pode nunca desaparecer'),
  };
  assert.equal((await coletarLocacaoPadrao(page, url, 262)).length, 262);
  assert.equal(requests.length, 13);
  assert.equal(requests.at(-1).searchParams.get('page'), '14');
});

test('Ribeiro preserva dados em total alterado, resposta repetida, timeout, HTTP invalido e redirecionamento', async () => {
  const page = {
    url: () => url,
    content: async () => `<span id="title--label">(2)</span>${card(1)}`,
    evaluate: async (_callback, destination) => ({ status: 200, url: destination, html: card(1) }),
  };
  await assert.rejects(coletarLocacaoPadrao(page, url, 3), /Total de locacao mudou/);
  await assert.rejects(coletarLocacaoPadrao(page, url, 2), /sem progresso/);
  page.evaluate = async () => { throw new Error('TimeoutError'); };
  await assert.rejects(coletarLocacaoPadrao(page, url, 2), /TimeoutError/);
  page.evaluate = async (_callback, destination) => ({ status: 503, url: destination, html: '' });
  await assert.rejects(coletarLocacaoPadrao(page, url, 2), /HTTP 503/);
  page.evaluate = async () => ({ status: 200, url: url.replace('locacao', 'venda'), html: card(2) });
  await assert.rejects(coletarLocacaoPadrao(page, url, 2), /redirecionada/);
});

test('Ribeiro extrator de aluguel fecha pagina em falha e nao entra no loop de cliques', async () => {
  let closed = false;
  const page = {
    setUserAgent: async () => {}, setViewport: async () => {},
    goto: async () => ({ status: () => 200 }),
    url: () => url,
    waitForSelector: async () => { throw new Error('Sem aviso LGPD'); },
    content: async () => `<span id="title--label">(2)</span>${card(1)}`,
    evaluate: async (_callback, destination) => ({ status: 503, url: destination, html: '' }),
    $: async () => assert.fail('Nao entrar no loop de cliques'),
    close: async () => { closed = true; },
  };
  await assert.rejects(extractRibeiroArrabalData({ newPage: async () => page }, [url], { negociacao: 'locacao', totalEsperado: 2 }), /HTTP 503/);
  assert.equal(closed, true);
});
