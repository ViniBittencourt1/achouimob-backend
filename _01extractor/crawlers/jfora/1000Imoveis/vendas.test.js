import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mock, test } from 'node:test';
import { linksBusca } from './extractor-00-rotaExterna.js';
import { projetoContagemVendas } from '../_utils/vendasContagemProjetos.js';
import { extractMilImoveisData } from './extractor.js';

test('1000Imoveis usa faixas sobrepostas sem lacunas ou teto de preco', () => {
  assert.equal(linksBusca.length, 4);
  const contagem = new URL(projetoContagemVendas('jf1000Imoveis').url);
  const faixas = linksBusca.map(link => new URL(link));
  for (const url of faixas) {
    assert.equal(url.origin, contagem.origin);
    assert.equal(url.pathname, contagem.pathname);
    assert.equal(url.searchParams.get('negociacao'), contagem.searchParams.get('negociacao'));
    assert.equal(url.searchParams.get('order'), 'recentes');
  }
  assert.equal(faixas[0].searchParams.get('preco_min'), '0');
  for (let i = 1; i < faixas.length; i++) {
    assert.equal(faixas[i - 1].searchParams.get('preco_max'), faixas[i].searchParams.get('preco_min'));
  }
  assert.equal(faixas.at(-1).searchParams.get('preco_max'), '');
});

test('1000Imoveis rejeita coleta incompleta antes de visitar os detalhes', async () => {
  await assert.rejects(extractMilImoveisData({}, [], { totalEsperado: 1 }), /Coleta incompleta: 0\/1.*detalhes nao serao visitados/);
  assert.deepEqual(await extractMilImoveisData({}, [], { totalEsperado: 0 }), []);
});

test('comando de vendas habilita coleta de lixo para processar a listagem completa', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8'));
  assert.match(pkg.scripts['1000imoveis'], /--expose-gc/);
  assert.match(pkg.scripts['1000imoveis'], /--max-old-space-size=8192/);
});

test('1000Imoveis libera o event loop entre lotes de cards antes de continuar', async () => {
  const card = codigo => `<div class="imovel-item imovel-item-show"><a href="https://1000imoveisjf.com.br/imovel/casa--venda--cod-${codigo}"></a><div class="imovel-item--titulo">Casa | Centro - Juiz de Fora</div><div class="imovel-item--localizacao">Centro - Juiz de Fora</div><div class="imovel-item--preco--item"><small>Valor de venda</small><b>R$ 100.000,00</b></div></div>`;
  const page = {
    setUserAgent: async () => {}, setViewport: async () => {}, goto: async () => {},
    waitForSelector: async () => { throw new Error('Sem LGPD'); },
    $: async () => null,
    $$: async () => Array.from({ length: 40 }),
    evaluate: async () => Array.from({ length: 40 }, (_, index) => card(index + 1)),
    close: async () => {},
  };
  let turns = 0;
  const immediate = globalThis.setImmediate;
  const timer = mock.method(globalThis, 'setImmediate', callback => {
    turns++;
    return immediate(callback);
  });
  try {
    const records = await extractMilImoveisData({ newPage: async () => page }, ['https://1000imoveisjf.com.br/imoveis?negociacao=venda'], { totalEsperado: 40 });
    assert.equal(records.length, 40);
    assert.equal(turns, 2);
  } finally { timer.mock.restore(); }
});
function paginaComCards(codigos) {
  const card = codigo => `<div class="imovel-item imovel-item-show"><a href="https://1000imoveisjf.com.br/imovel/casa--venda--cod-${codigo}"></a><div class="imovel-item--titulo">Casa | Centro - Juiz de Fora</div><div class="imovel-item--localizacao">Centro - Juiz de Fora</div><div class="imovel-item--preco--item"><small>Valor de venda</small><b>R$ 100.000,00</b></div></div>`;
  const page = {
    setUserAgent: async () => {}, setViewport: async () => {}, goto: async () => {},
    waitForSelector: async () => { throw new Error('Sem LGPD'); },
    $: async () => null,
    $$: async () => codigos,
    evaluate: async () => codigos.map(card),
    close: async () => {},
  };
  return { newPage: async () => page };
}

test('1000Imoveis ignora card repetido quando anuncio novo desloca o carregar mais', async () => {
  const records = await extractMilImoveisData(paginaComCards([1, 2, 3, 3]), ['https://1000imoveisjf.com.br/imoveis?negociacao=venda'], { totalEsperado: 3 });
  assert.deepEqual(records.map(item => item.linkReal.split('-').pop()), ['1', '2', '3']);
});

test('1000Imoveis reconta o site antes de rejeitar diferenca na coleta', async () => {
  let recontagens = 0;
  const records = await extractMilImoveisData(paginaComCards([1, 2, 3]), ['https://1000imoveisjf.com.br/imoveis?negociacao=venda'], {
    totalEsperado: 2,
    recontarTotal: async () => { recontagens++; return 3; },
  });
  assert.equal(records.length, 3);
  assert.equal(records.totalConfirmado, 3);
  assert.equal(recontagens, 1);
  await assert.rejects(extractMilImoveisData(paginaComCards([1, 2, 3]), ['https://1000imoveisjf.com.br/imoveis?negociacao=venda'], {
    totalEsperado: 2,
    recontarTotal: async () => 4,
  }), /Coleta incompleta: 3\/4/);
});

function browserPorFaixa(dados) {
  const card = codigo => `<div class="imovel-item imovel-item-show"><a href="https://1000imoveisjf.com.br/imovel/casa--venda--cod-${codigo}"></a><div class="imovel-item--titulo">Casa | Centro - Juiz de Fora</div><div class="imovel-item--localizacao">Centro - Juiz de Fora</div><div class="imovel-item--preco--item"><small>Valor de venda</small><b>R$ 100.000,00</b></div></div>`;
  return {
    newPage: async () => {
      let atual;
      return {
        setUserAgent: async () => {}, setViewport: async () => {},
        goto: async url => { atual = dados[url]; },
        waitForSelector: async () => { throw new Error('Sem LGPD'); },
        $eval: async () => `Imóveis (${atual.total})`,
        $$: async () => atual.codigos,
        $: async () => null,
        evaluate: async () => atual.codigos.map(card),
        close: async () => {},
      };
    },
  };
}

test('valida cada faixa e deduplica anuncios na fronteira', async () => {
  const browser = browserPorFaixa({
    faixa1: { total: 2, codigos: [1, 2] },
    faixa2: { total: 2, codigos: [2, 3] },
  });
  const records = await extractMilImoveisData(browser, ['faixa1', 'faixa2'], {
    totalEsperado: 3, validarTotalPorPagina: true,
  });
  assert.deepEqual(records.map(item => item.linkReal.split('-').pop()), ['1', '2', '3']);
});

test('rejeita faixa com cards duplicados mesmo quando o total global poderia coincidir', async () => {
  const browser = browserPorFaixa({ faixa: { total: 2, codigos: [1, 1] } });
  await assert.rejects(extractMilImoveisData(browser, ['faixa'], {
    totalEsperado: 1, validarTotalPorPagina: true,
  }), /Faixa incompleta: 1\/2 links únicos/);
});

test('rejeita contagem invalida de uma faixa antes de aceitar o total global', async () => {
  const browser = browserPorFaixa({ faixa: { total: 'indisponivel', codigos: [1] } });
  await assert.rejects(extractMilImoveisData(browser, ['faixa'], {
    totalEsperado: 1, validarTotalPorPagina: true,
  }), /Contagem da faixa inválida/);
});

test('usa listagem sem filtro se as faixas nao cobrem a contagem global', async () => {
  const browser = browserPorFaixa({
    faixa: { total: 1, codigos: [1] },
    completa: { total: 2, codigos: [1, 2] },
  });
  const records = await extractMilImoveisData(browser, ['faixa'], {
    totalEsperado: 3, validarTotalPorPagina: true, linkSemFaixa: 'completa',
    recontarTotal: async () => 2,
  });
  assert.equal(records.length, 2);
  assert.equal(records.totalConfirmado, 2);
});

test('rejeita tambem a listagem sem filtro quando incompleta', async () => {
  const browser = browserPorFaixa({
    faixa: { total: 1, codigos: [1] },
    completa: { total: 2, codigos: [1, 1] },
  });
  await assert.rejects(extractMilImoveisData(browser, ['faixa'], {
    totalEsperado: 2, validarTotalPorPagina: true, linkSemFaixa: 'completa',
  }), /Coleta incompleta: 1\/2/);
});