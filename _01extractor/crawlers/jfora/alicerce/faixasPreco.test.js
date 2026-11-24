import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coletarFaixasAlicerce, urlFaixaAlicerce } from './faixasPreco.js';
import { contarFaixaAlicerce, extractAlicerceData } from './extractor.js';

const url = 'https://alicerceimob.com.br/imoveis?order=recentes&negociacao=venda';
const preco = value => value === null ? null : Math.round(Number(value.replace(/\./g, '').replace(',', '.')) * 100);
const row = (id, centavos) => ({ linkReal: `https://alicerceimob.com.br/imovel/${id}`, centavos });

function fakeFaixas(rows) {
  const consultas = [];
  const lotes = [];
  const filtrar = value => {
    const params = new URL(value).searchParams;
    const min = preco(params.get('preco_min'));
    const max = preco(params.get('preco_max'));
    return rows.filter(item => (min === null && max === null)
      || (item.centavos !== null && (min === null || item.centavos >= min) && (max === null || item.centavos <= max)));
  };
  return {
    consultas, lotes,
    contar: async value => { consultas.push(value); return filtrar(value).length; },
    coletar: async (value, total) => {
      const selecionados = filtrar(value);
      assert.equal(selecionados.length, total);
      lotes.push({ url: value, total });
      return selecionados;
    },
  };
}

test('faixas subdividem 1078 anuncios em lotes de ate 200 e conservam limites com centavos e teto aberto', async () => {
  const rows = Array.from({ length: 1078 }, (_, index) => row(index, index * 123456));
  rows[0].centavos = 0;
  rows[1].centavos = 50_000_000;
  rows[2].centavos = 50_000_001;
  rows[3].centavos = 5_000_000_000;
  const fake = fakeFaixas(rows);
  const result = await coletarFaixasAlicerce({ url, totalEsperado: 1078, ...fake });
  assert.equal(result.length, 1078);
  assert.equal(new Set(result.map(item => item.linkReal)).size, 1078);
  assert.ok(fake.lotes.length > 1);
  assert.ok(fake.lotes.every(lote => lote.total <= 200));
  assert.ok(fake.lotes.some(lote => !new URL(lote.url).searchParams.has('preco_max')));
  assert.ok(fake.consultas.some(value => new URL(value).searchParams.get('preco_min') === '500000,01'));
  for (const value of fake.consultas) {
    assert.equal(new URL(value).searchParams.get('negociacao'), 'venda');
    assert.equal(new URL(value).searchParams.get('order'), 'recentes');
  }
});

test('ate 200 anuncios nao cria filtros nem lotes desnecessarios; zero nao exige coleta', async () => {
  for (const quantidade of [0, 200]) {
    const fake = fakeFaixas(Array.from({ length: quantidade }, (_, index) => row(index, 100)));
    const result = await coletarFaixasAlicerce({ url, ...fake });
    assert.equal(result.length, quantidade);
    assert.equal(fake.lotes.length, quantidade ? 1 : 0);
    assert.ok(fake.consultas.every(value => !new URL(value).searchParams.has('preco_max')));
  }
});

test('sem preco e sob consulta sao recuperados pela busca original com aviso e sem duplicar os precificados', async () => {
  const rows = Array.from({ length: 220 }, (_, index) => row(index, index * 1_000_000));
  rows.push({ ...row('consulta', null), preco: null });
  const fake = fakeFaixas(rows);
  const warnings = [];
  const warn = console.warn;
  console.warn = message => warnings.push(message);
  try {
    const result = await coletarFaixasAlicerce({ url, totalEsperado: rows.length, ...fake });
    assert.equal(result.length, rows.length);
    assert.equal(result.find(item => item.linkReal.endsWith('/consulta')).preco, null);
    assert.match(warnings.join('\n'), /recuperar anuncios sem preco/);
    assert.equal(fake.lotes.at(-1).total, rows.length);
    assert.equal(fake.lotes.at(-1).url, url);
  } finally { console.warn = warn; }
});

test('precos identicos acima do limite terminam em faixa minima sem recursao infinita', async () => {
  const fake = fakeFaixas(Array.from({ length: 201 }, (_, index) => row(index, 40_000_000)));
  const warnings = [];
  const warn = console.warn;
  console.warn = message => warnings.push(message);
  try {
    assert.equal((await coletarFaixasAlicerce({ url, ...fake })).length, 201);
    assert.equal(fake.lotes.length, 1);
    const params = new URL(fake.lotes[0].url).searchParams;
    assert.equal(params.get('preco_min'), '400000,00');
    assert.equal(params.get('preco_max'), '400000,00');
    assert.ok(fake.consultas.length < 85);
    assert.match(warnings.join('\n'), /mesma faixa minima/);
  } finally { console.warn = warn; }
});

test('faixas preservam filtros originais de locacao, centavos e limites de preco', async () => {
  const busca = `${url.replace('venda', 'locacao')}&tipo=apartamento&preco_min=1.000%2C50&preco_max=50.000%2C00`;
  const rows = Array.from({ length: 220 }, (_, index) => row(index, 100050 + index * 10000));
  const fake = fakeFaixas(rows);
  assert.equal((await coletarFaixasAlicerce({ url: busca, ...fake })).length, rows.length);
  for (const value of fake.consultas) {
    const params = new URL(value).searchParams;
    assert.equal(params.get('negociacao'), 'locacao');
    assert.equal(params.get('tipo'), 'apartamento');
    assert.ok(preco(params.get('preco_min')) >= 100050);
    assert.ok(preco(params.get('preco_max')) <= 5000000);
  }
  assert.equal(new URL(urlFaixaAlicerce(`${busca}&page=9`, 100050, 5000000)).searchParams.has('page'), false);
});

test('contagem alterada, incompletude, links ausentes e duplicatas impedem retorno parcial', async () => {
  const cases = [
    { totalEsperado: 2, contar: async () => 1, coletar: async () => assert.fail() },
    { contar: async () => 1, coletar: async () => [] },
    { contar: async () => 2, coletar: async () => [row(1, 1), row(1, 1)] },
    { contar: async () => 1, coletar: async () => [{}] },
    { contar: async () => -1, coletar: async () => assert.fail() },
    { contar: async () => 201, coletar: async () => assert.fail() },
  ];
  for (const options of cases) await assert.rejects(coletarFaixasAlicerce({ url, ...options }), /base preservada/);
  let count = 0;
  await assert.rejects(coletarFaixasAlicerce({
    url, contar: async () => ++count === 1 ? 1 : 2, coletar: async () => [row(1, 1)],
  }), /Total mudou/);
  await assert.rejects(coletarFaixasAlicerce({ url: `${url}&preco_min=erro`, contar: async () => assert.fail() }), /Filtro de preco invalido/);
  await assert.rejects(coletarFaixasAlicerce({ url: `${url}&preco_min=2%2C00&preco_max=1%2C00` }), /invertida/);
});

test('contador fecha a pagina em sucesso, HTTP invalido, redirecionamento e contador desconhecido', async () => {
  for (const scenario of ['ok', 'http', 'redirect', 'label']) {
    let closed = 0;
    const browser = { newPage: async () => ({
      goto: async () => ({ ok: () => scenario !== 'http', status: () => 403 }),
      url: () => scenario === 'redirect' ? url.replace('venda', 'locacao') : url,
      $eval: async () => scenario === 'label' ? 'Site indisponivel' : ' Imóveis \u00a0 (1078) ',
      close: async () => { closed++; },
    }) };
    if (scenario === 'ok') assert.equal(await contarFaixaAlicerce(browser, url), 1078);
    else await assert.rejects(contarFaixaAlicerce(browser, url), /base preservada/);
    assert.equal(closed, 1);
  }
});

test('extrator publico integra contagens e coleta por faixas sem salvar dados', async () => {
  let closed = 0;
  let created = 0;
  const browser = { newPage: async () => {
    created++;
    let destination;
    return {
      goto: async value => { destination = value; return { ok: () => true }; },
      url: () => destination, $eval: async () => 'Imóveis (1)',
      setRequestInterception: async () => {}, on: () => {},
      setUserAgent: async () => {}, setViewport: async () => {},
      evaluate: async () => ({ clicked: false, count: 1 }), waitForFunction: async () => {},
      $$eval: async () => ['<div class="imovel-item"><a href="https://alicerceimob.com.br/imovel/1"></a><div class="imovel-item--cod"><span>1</span></div></div>'],
      close: async () => { closed++; },
    };
  } };
  assert.equal((await extractAlicerceData(browser, [url], { totalEsperado: 1 })).length, 1);
  assert.equal(created, 3);
  assert.equal(closed, created);
});
