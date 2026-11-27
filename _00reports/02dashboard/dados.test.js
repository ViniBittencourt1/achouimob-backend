import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { carregarDados, consultarDados, dataRegistro } from './dados.js';
import { criarServidor } from './server.js';

const record = (code, extra = {}) => ({
  codigoBase: code, linkReal: `https://example.com/imovel/${code}`,
  titulo: `Imovel ${code}`, cidade: 'juiz-de-fora-mg', dataInclusao: '2026-11-21',
  dataExclusao: '', ...extra,
});
const params = extra => new URLSearchParams({ inicio: '2026-11-21', fim: '2026-11-27', ...extra });

async function fixture(t, files) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dashboard-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const [file, records] of Object.entries(files)) await writeFile(path.join(dir, file), JSON.stringify(records));
  return dir;
}

test('datas brasileiras e ISO respeitam o dia de Sao Paulo e rejeitam datas invalidas', () => {
  assert.equal(dataRegistro('21/11/2026 10:11:12'), '2026-11-21');
  assert.equal(dataRegistro('2026-11-22T01:00:00.000Z'), '2026-11-21');
  assert.equal(dataRegistro('2026-11-22'), '2026-11-22');
  for (const value of ['31/02/2026', '2026-02-30', '', '0', null, 'ontem']) assert.equal(dataRegistro(value), null);
});

test('entradas incluem retirados e deduplicam snapshots sem perder retiradas e reentradas', async t => {
  const dir = await fixture(t, {
    'jfTeste.json': [record('A'), record('B', { dataInclusao: '2026-11-27' })],
    'jfTesteRetiradosVendas.json': [
      record('A', { dataExclusao: '2026-11-22' }),
      record('A', { dataExclusao: '2026-11-22', retiradaId: 'snapshot-diferente' }),
      record('B', { dataInclusao: '2026-11-01', dataExclusao: '2026-11-25' }),
      record('C', { dataExclusao: '2026-11-27' }),
    ],
  });
  const data = await carregarDados(dir);
  const result = consultarDados(data, params());
  assert.deepEqual(result.totais, { ativos: 2, entradas: 3, saidas: 3 });
  assert.equal(result.registros.find(row => row.codigo === 'B').inclusao, '2026-11-27');
  assert.equal(consultarDados(data, params({ visao: 'saidas' })).registros[0].exclusao, '2026-11-27');
});

test('filtra cidade e negociacao, preserva anuncios entre imobiliarias e nao filtra estoque atual por data', async t => {
  const dir = await fixture(t, {
    'jfTeste.json': [record('A', { dataInclusao: '2020-01-01' }), record('B', { cidade: 'niteroi-rj' })],
    'jfOutra.json': [record('A')],
    'jfTesteLocacao.json': [record('A')],
    'config.json': { ignorado: true },
  });
  const data = await carregarDados(dir);
  const filtered = consultarDados(data, params({ cidade: 'juiz-de-fora-mg', visao: 'ativos' }));
  assert.deepEqual(filtered.totais, { ativos: 2, entradas: 1, saidas: 0 });
  assert.equal(filtered.registros.length, 2);
  assert.equal(consultarDados(data, params({ negociacao: 'aluguel' })).totais.entradas, 1);
  assert.equal(consultarDados(data, params({ negociacao: 'todos' })).totais.ativos, 4);
});

test('serie temporal inclui zeros, toda a selecao e comparacao com os mesmos filtros', async t => {
  const dir = await fixture(t, {
    'jfTesteRetiradosVendas.json': [
      ...Array.from({ length: 51 }, (_, i) => record(`atual${i}`, { tipoImovel: 'Apartamento', dataExclusao: '2026-11-21' })),
      record('ultimo', { tipoImovel: 'apartamento', dataExclusao: '2026-11-23' }),
      record('anterior', { tipoImovel: 'apartamento', dataExclusao: '2026-10-21' }),
      record('outro-tipo', { tipoImovel: 'casa', dataExclusao: '2026-10-21' }),
      record('outra-cidade', { tipoImovel: 'apartamento', cidade: 'niteroi-rj', dataExclusao: '2026-10-21' }),
      record('sem-data', { tipoImovel: 'apartamento', dataExclusao: 'invalida' }),
    ],
    'jfTesteRetiradosLocacao.json': [record('aluguel', { tipoImovel: 'apartamento', dataExclusao: '2026-10-21' })],
  });
  const data = await carregarDados(dir);
  const query = params({ visao: 'saidas', cidade: 'juiz-de-fora-mg', tipo: 'apartamento', fim: '2026-11-23', pagina: '2' });
  const result = consultarDados(data, query);
  assert.equal(result.registros.length, 2);
  assert.deepEqual(result.temporal.pontos.map(item => item.quantidade), [51, 0, 1]);
  assert.equal(result.temporal.pontos[1].variacaoPercentual, -100);
  assert.equal(result.temporal.pontos[2].variacaoPercentual, null);
  assert.deepEqual(result.temporal.comparacao, {
    inicioAtual: '2026-11-21', fimAtual: '2026-11-23', inicioAnterior: '2026-10-21', fimAnterior: '2026-10-23',
    totalAtual: 52, totalAnterior: 1, diferenca: 51, variacaoPercentual: 5100,
    diasAtual: 3, diasAnterior: 3, sobreposicao: false,
  });
  query.set('negociacao', 'todos');
  assert.equal(consultarDados(data, query).temporal.comparacao.totalAnterior, 2);
  query.set('visao', 'entradas');
  assert.equal(consultarDados(data, query).temporal.comparacao.totalAtual, 55);
  assert.equal(consultarDados(data, query).temporal.comparacao.totalAnterior, 0);
});

test('escala temporal usa semanas civis e bordas parciais, meses e anos sem perder eventos', async t => {
  const dir = await fixture(t, { 'jfTeste.json': [
    record('A', { dataInclusao: '2025-12-31' }), record('B', { dataInclusao: '2026-01-01' }),
    record('C', { dataInclusao: '2026-01-05' }),
  ] });
  const data = await carregarDados(dir);
  const query = params({ inicio: '2025-12-31', fim: '2026-01-06', escala: 'semana' });
  assert.deepEqual(consultarDados(data, query).temporal.pontos.map(({ inicio, fim, quantidade }) => ({ inicio, fim, quantidade })), [
    { inicio: '2025-12-31', fim: '2026-01-04', quantidade: 2 },
    { inicio: '2026-01-05', fim: '2026-01-06', quantidade: 1 },
  ]);
  for (const escala of ['mes', 'ano']) {
    query.set('escala', escala);
    assert.deepEqual(consultarDados(data, query).temporal.pontos.map(item => item.quantidade), [1, 2]);
  }
  for (const [inicio, fim, escala] of [
    ['2026-01-01', '2026-01-31', 'dia'], ['2026-01-01', '2026-04-30', 'semana'],
    ['2026-01-01', '2026-12-31', 'mes'], ['2024-01-01', '2026-12-31', 'ano'],
  ]) {
    const result = consultarDados(data, params({ inicio, fim }));
    assert.equal(result.temporal.escala, escala);
    assert.equal(result.temporal.pontos.reduce((sum, item) => sum + item.quantidade, 0), result.totais.entradas);
  }
});

test('comparacao ajusta fim de mes, aceita datas manuais e nao inventa percentual sobre zero', async t => {
  const dir = await fixture(t, { 'jfTeste.json': [
    record('A', { dataInclusao: '2024-03-31' }), record('B', { dataInclusao: '2024-02-29' }),
  ] });
  const data = await carregarDados(dir);
  const query = params({ inicio: '2024-03-30', fim: '2024-03-31' });
  let result = consultarDados(data, query).temporal;
  assert.equal(result.comparacao.inicioAnterior, '2024-02-29');
  assert.equal(result.comparacao.fimAnterior, '2024-02-29');
  assert.equal(result.comparacao.diasAnterior, 1);
  assert.equal(result.comparacao.variacaoPercentual, 0);
  result = consultarDados(data, params({ inicio: '2024-02-29', fim: '2024-02-29', compararInicio: '2024-03-31', compararFim: '2024-03-31' })).temporal;
  assert.equal(result.comparacao.totalAnterior, 1);
  result = consultarDados(data, params({ compararInicio: '2026-11-21', compararFim: '2026-11-27' })).temporal;
  assert.equal(result.comparacao.variacaoPercentual, null);
  assert.equal(result.comparacao.sobreposicao, true);
  assert.ok(result.pontos.every(item => item.quantidade === 0));
  for (const extra of [
    { escala: 'hora' }, { compararInicio: '2026-10-01' },
    { compararInicio: '', compararFim: '' },
    { compararInicio: '2026-02-30', compararFim: '2026-03-01' },
    { compararInicio: '2026-11-27', compararFim: '2026-11-21' },
    { inicio: '2020-01-01', fim: '2026-01-01', escala: 'dia' },
  ]) assert.throws(() => consultarDados(data, params(extra)), /invalida|invalido|1000/);
  assert.equal(consultarDados(data, params({ visao: 'ativos' })).temporal, null);
});

test('nao inventa datas ausentes e informa arquivos invalidos explicitamente', async t => {
  const dir = await fixture(t, {
    'jfTeste.json': [record('A', { dataInclusao: '' })],
    'jfTesteRetiradosVendas.json': [record('B', { dataExclusao: 'invalida' }), record('', { linkReal: '' })],
  });
  const data = await carregarDados(dir);
  assert.deepEqual(data.avisos, { semInclusao: 1, semExclusao: 1, semIdentidade: 1 });
  assert.deepEqual(consultarDados(data, params()).totais, { ativos: 1, entradas: 1, saidas: 0 });
  await writeFile(path.join(dir, 'jfTeste.json'), '{"invalid":true}');
  await assert.rejects(carregarDados(dir), /jfTeste.json: a base precisa ser uma lista/);
});

test('periodo inclui ambas as pontas, valida filtros e pagina resultados', async t => {
  const dir = await fixture(t, { 'jfTeste.json': [
    ...Array.from({ length: 51 }, (_, index) => record(String(index))),
    record('fim', { dataInclusao: '2026-11-27' }),
    record('antes', { dataInclusao: '2026-11-20' }),
    record('depois', { dataInclusao: '2026-11-28' }),
  ] });
  const data = await carregarDados(dir);
  const result = consultarDados(data, params({ pagina: '2' }));
  assert.equal(result.total, 52);
  assert.equal(result.registros.length, 2);
  assert.equal(result.paginas, 2);
  assert.equal(consultarDados(data, params({ pagina: '100' })).pagina, 2);
  for (const invalid of [{ inicio: '2026-02-30' }, { fim: '2026-11-01' }, { pagina: '0' }, { negociacao: 'outro' }, { visao: '__proto__' }]) {
    assert.throws(() => consultarDados(data, params(invalid)), /Filtros invalidos/);
  }
});

test('tipo filtra contagens, lista e valores de cada tela antes da paginacao', async t => {
  const dir = await fixture(t, {
    'jfTeste.json': [
      ...Array.from({ length: 51 }, (_, index) => record(String(index), { tipoImovel: 'casa', preco: 100000, areaValor: 50 })),
      record('apto', { tipoImovel: 'apartamento', preco: 200000, areaValor: 100 }),
      record('sem-area', { tipoImovel: 'casa', preco: 300000, areaValor: 0 }),
      record('sem-preco', { tipoImovel: 'casa', preco: null, areaValor: 10 }),
      record('preco-zero', { tipoImovel: 'casa', preco: 0, areaValor: 10 }),
      record('negativo', { tipoImovel: 'casa', preco: -100, areaValor: 10 }),
    ],
    'jfTesteLocacao.json': [record('aluguel', { tipoImovel: 'casa', preco: 2000, areaValor: 100 })],
    'jfTesteRetiradosVendas.json': [record('retirado', {
      tipoImovel: 'casa', dataInclusao: '2026-11-01', dataExclusao: '2026-11-24', preco: 150000, areaValor: 100,
    })],
  });
  const data = await carregarDados(dir);
  const entradas = consultarDados(data, params({ tipo: 'casa', negociacao: 'todos' }));
  assert.deepEqual(entradas.totais, { ativos: 56, entradas: 56, saidas: 1 });
  assert.equal(entradas.registros.length, 50);
  assert.ok(entradas.registros.every(row => row.tipo === 'casa'));
  assert.deepEqual(entradas.financeiro, {
    totalVendas: 5400000, ticketMedio: 5400000 / 52, valorM2: 2000, comPreco: 52, comArea: 51, vendas: 55,
  });
  assert.deepEqual(consultarDados(data, params({ tipo: 'casa', visao: 'saidas' })).financeiro, {
    totalVendas: 150000, ticketMedio: 150000, valorM2: 1500, comPreco: 1, comArea: 1, vendas: 1,
  });
  assert.deepEqual(consultarDados(data, params({ negociacao: 'aluguel' })).financeiro, {
    totalVendas: null, ticketMedio: null, valorM2: null, comPreco: 0, comArea: 0, vendas: 0,
  });
});

test('valor m2 usa preco total sobre area total e informa ausencia de area valida', async t => {
  const dir = await fixture(t, { 'jfTeste.json': [
    record('A', { tipoImovel: 'casa', preco: 100000, areaValor: 50 }),
    record('B', { tipoImovel: 'casa', preco: 900000, areaValor: 300 }),
    record('C', { tipoImovel: 'terreno', preco: 200000, areaValor: null }),
  ] });
  const data = await carregarDados(dir);
  assert.equal(consultarDados(data, params({ tipo: 'casa' })).financeiro.valorM2, 1000000 / 350);
  const terreno = consultarDados(data, params({ tipo: 'terreno' })).financeiro;
  assert.equal(terreno.totalVendas, 200000);
  assert.equal(terreno.valorM2, null);
});

test('ranking por bairro usa toda a selecao e ordena quantidade, total e ticket medio', async t => {
  const dir = await fixture(t, {
    'jfTeste.json': [
      ...Array.from({ length: 51 }, (_, index) => record(`volume-${index}`, { tipoImovel: 'apartamento', bairro: 'volume', preco: 1000 })),
      record('A', { tipoImovel: 'apartamento', bairro: 'centro', preco: 200000 }),
      record('B', { tipoImovel: 'apartamento', bairro: 'centro', preco: 100000 }),
      record('C', { tipoImovel: 'apartamento', bairro: 'bom-pastor', preco: 250000 }),
      record('D', { tipoImovel: 'apartamento', bairro: 'sem-preco', preco: null }),
      record('E', { tipoImovel: 'apartamento', bairro: '', preco: 0 }),
      record('outra-cidade', { tipoImovel: 'apartamento', bairro: 'centro', cidade: 'niteroi-rj', preco: 500000 }),
      record('outro-tipo', { tipoImovel: 'casa', bairro: 'centro', preco: 999999 }),
      record('fora-periodo', { tipoImovel: 'apartamento', bairro: 'centro', dataInclusao: '2026-11-20', preco: 999999 }),
    ],
    'jfTesteLocacao.json': [record('aluguel', { tipoImovel: 'apartamento', bairro: 'centro', preco: 3000 })],
    'jfTesteRetiradosVendas.json': [record('retirado', {
      tipoImovel: 'apartamento', bairro: 'jardim', dataInclusao: '2026-11-01', dataExclusao: '2026-11-25', preco: 999000,
    })],
  });
  const data = await carregarDados(dir);
  const filters = { cidade: 'juiz-de-fora-mg', tipo: 'apartamento', pagina: '2' };
  const quantity = consultarDados(data, params(filters));
  assert.equal(quantity.registros.length, 6);
  assert.equal(quantity.rankingBairros[0].bairro, 'volume');
  assert.equal(quantity.rankingBairros[0].valor, 51);
  assert.equal(quantity.rankingBairros[0].percentual, 51 / 56 * 100);
  assert.equal(quantity.rankingBairros.reduce((sum, item) => sum + item.quantidade, 0), quantity.total);
  assert.ok(quantity.rankingBairros.some(item => item.bairro === ''));
  const total = consultarDados(data, params({ ...filters, ranking: 'totalVendas' }));
  assert.equal(total.rankingBairros[0].bairro, 'centro');
  assert.equal(total.rankingBairros[0].valor, 300000);
  assert.equal(total.rankingBairros[0].percentual, 300000 / 601000 * 100);
  assert.equal(total.rankingBairros.reduce((sum, item) => sum + (item.totalVendas ?? 0), 0), total.financeiro.totalVendas);
  assert.equal(total.rankingBairros.at(-1).valor, null);
  const ticket = consultarDados(data, params({ ...filters, ranking: 'ticketMedio' }));
  assert.equal(ticket.rankingBairros[0].bairro, 'bom-pastor');
  assert.equal(ticket.rankingBairros[0].valor, 250000);
  assert.equal(ticket.rankingBairros[0].percentual, (250000 / (601000 / 54) - 1) * 100);
  assert.ok(ticket.rankingBairros.find(item => item.bairro === 'volume').percentual < 0);
  assert.equal(ticket.rankingBairros.find(item => item.bairro === 'centro').ticketMedio, 150000);
  const saidas = consultarDados(data, params({ ...filters, visao: 'saidas' }));
  assert.deepEqual(saidas.rankingBairros.map(item => [item.bairro, item.quantidade, item.totalVendas]), [['jardim', 1, 999000]]);
  const cidades = consultarDados(data, params({ tipo: 'apartamento' }));
  assert.equal(cidades.rankingBairros.filter(item => item.bairro === 'centro').length, 2);
  const todos = consultarDados(data, params({ ...filters, negociacao: 'todos' }));
  const centro = todos.rankingBairros.find(item => item.bairro === 'centro');
  assert.equal(centro.quantidade, 3);
  assert.equal(centro.totalVendas, 300000);
  assert.equal(centro.ticketMedio, 150000);
  const details = consultarDados(data, params({ ...filters, pagina: '1', negociacao: 'todos', bairro: 'centro', bairroCidade: 'juiz-de-fora-mg', ranking: 'ticketMedio' }));
  assert.equal(details.total, centro.comPreco);
  assert.deepEqual(details.registros.map(row => row.codigo).sort(), ['A', 'B']);
});

test('ranking sem movimentacao ou sem precos validos nao inventa valores', async t => {
  const dir = await fixture(t, {
    'jfTesteLocacao.json': [record('A', { bairro: 'centro', preco: 1000 })],
  });
  const data = await carregarDados(dir);
  assert.deepEqual(consultarDados(data, params()).rankingBairros, []);
  const rentals = consultarDados(data, params({ negociacao: 'aluguel', ranking: 'ticketMedio' }));
  assert.equal(rentals.rankingBairros[0].quantidade, 1);
  assert.equal(rentals.rankingBairros[0].valor, null);
  assert.equal(rentals.rankingBairros[0].percentual, null);
  assert.throws(() => consultarDados(data, params({ ranking: '__proto__' })), /criterio do ranking/);
});

test('detalhe por cidade e bairro reflete o ranking e pagina a selecao completa', async t => {
  const dir = await fixture(t, {
    'jfTeste.json': [
      ...Array.from({ length: 51 }, (_, index) => record(`A${index}`, { bairro: 'centro', preco: 1000, areaValor: 20 })),
      record('outra-cidade', { bairro: 'centro', cidade: 'niteroi-rj' }),
      record('sem-bairro', { bairro: '' }),
      record('outro-periodo', { bairro: 'centro', dataInclusao: '2020-01-01' }),
    ],
    'jfTesteRetiradosVendas.json': [record('retirado', { bairro: 'centro', dataExclusao: '2026-11-25' })],
  });
  const data = await carregarDados(dir);
  const overall = consultarDados(data, params({ cidade: 'juiz-de-fora-mg' }));
  const group = overall.rankingBairros.find(row => row.bairro === 'centro');
  assert.equal(group.valorM2, 50);
  const first = consultarDados(data, params({ cidade: 'juiz-de-fora-mg', bairro: 'centro', bairroCidade: 'juiz-de-fora-mg' }));
  const second = consultarDados(data, params({ cidade: 'juiz-de-fora-mg', bairro: 'centro', bairroCidade: 'juiz-de-fora-mg', pagina: '2' }));
  assert.equal(first.total, group.quantidade);
  assert.equal(first.registros.length, 50);
  assert.equal(second.registros.length, 2);
  assert.ok([...first.registros, ...second.registros].every(row => row.cidade === 'juiz-de-fora-mg' && row.bairro === 'centro'));
  const blank = consultarDados(data, params({ cidade: 'juiz-de-fora-mg', bairro: '', bairroCidade: 'juiz-de-fora-mg' }));
  assert.equal(blank.total, 1);
  const exits = consultarDados(data, params({ visao: 'saidas', bairro: 'centro', bairroCidade: 'juiz-de-fora-mg' }));
  assert.equal(exits.total, 1);
  assert.equal(exits.registros[0].codigo, 'retirado');
  assert.throws(() => consultarDados(data, params({ bairro: 'centro' })), /Filtro de bairro invalido/);
});

test('m2 individual compara com referencia ponderada do bairro em todas as paginas', async t => {
  const dir = await fixture(t, {
    'jfTeste.json': [
      ...Array.from({ length: 51 }, (_, index) => record(`A${index}`, { bairro: 'centro', tipoImovel: 'apartamento', preco: 100000, areaValor: 50 })),
      record('B', { bairro: 'centro', tipoImovel: 'apartamento', preco: 900000, areaValor: 300 }),
      record('sem-area', { bairro: 'centro', tipoImovel: 'apartamento', preco: 100000, areaValor: 0 }),
      record('sem-preco', { bairro: 'centro', tipoImovel: 'apartamento', preco: null, areaValor: 100 }),
      record('outra-cidade', { bairro: 'centro', cidade: 'niteroi-rj', tipoImovel: 'apartamento', preco: 10000000, areaValor: 1 }),
      record('outro-tipo', { bairro: 'centro', tipoImovel: 'casa', preco: 10000000, areaValor: 1 }),
    ],
    'jfTesteLocacao.json': [record('aluguel', { bairro: 'centro', tipoImovel: 'apartamento', preco: 2000, areaValor: 100 })],
  });
  const data = await carregarDados(dir);
  const filters = { tipo: 'apartamento', negociacao: 'todos', bairro: 'centro', bairroCidade: 'juiz-de-fora-mg' };
  const first = consultarDados(data, params(filters));
  const second = consultarDados(data, params({ ...filters, pagina: '2' }));
  const reference = 6000000 / 2850;
  assert.equal(first.valorM2Bairro, reference);
  assert.equal(second.valorM2Bairro, reference);
  const ranking = consultarDados(data, params({ tipo: 'apartamento', negociacao: 'todos' }));
  assert.equal(ranking.rankingBairros.find(row => row.cidade === 'juiz-de-fora-mg').valorM2, reference);
  const records = [...first.registros, ...second.registros];
  const lower = records.find(row => row.codigo === 'A0');
  const higher = records.find(row => row.codigo === 'B');
  assert.equal(lower.valorM2, 2000);
  assert.equal(lower.variacaoM2Bairro, (2000 / reference - 1) * 100);
  assert.equal(higher.valorM2, 3000);
  assert.equal(higher.variacaoM2Bairro, (3000 / reference - 1) * 100);
  for (const code of ['sem-area', 'sem-preco', 'aluguel']) {
    assert.equal(records.find(row => row.codigo === code).valorM2, null);
    assert.equal(records.find(row => row.codigo === code).variacaoM2Bairro, null);
  }
  const rental = consultarDados(data, params({ ...filters, negociacao: 'aluguel' }));
  assert.equal(rental.valorM2Bairro, null);
  assert.equal(rental.registros[0].variacaoM2Bairro, null);
  const single = consultarDados(data, params({ ...filters, bairroCidade: 'niteroi-rj' }));
  assert.equal(single.registros[0].variacaoM2Bairro, 0);
});

test('filtro oferece somente nomes principais e agrupa aliases pelo slug nas tres visoes', async t => {
  const dir = await fixture(t, {
    'catalogo.json': { tiposPorSlug: {
      apartamento: [{ nome: 'Apartamento', slug: 'apartamento' }, { nome: 'Apto', slug: 'apartamento' }],
      sala: [{ nome: 'Salas/Conjuntos', principal: 'nao' }, { nome: 'Sala', principal: 'sim' }, { nome: 'Conjunto Comercial / Sala', principal: 'nao' }],
    } },
    'jfTeste.json': [
      record('slug', { tipoImovel: 'apartamento' }),
      record('nome', { tipoImovel: 'Apartamento' }),
      record('alias', { tipoImovel: 'APTO' }),
      record('sala', { tipoImovel: 'Salas/Conjuntos' }),
      record('desconhecido', { tipoImovel: 'Tipo nao cadastrado' }),
    ],
    'jfTesteRetiradosVendas.json': [record('retirado', { tipoImovel: 'Conjunto Comercial / Sala', dataExclusao: '2026-11-25' })],
  });
  const data = await carregarDados(dir, path.join(dir, 'catalogo.json'));
  assert.deepEqual(data.tipos, [{ slug: 'apartamento', nome: 'Apartamento' }, { slug: 'sala', nome: 'Sala' }]);
  const apartamento = consultarDados(data, params({ tipo: 'Apartamento' }));
  assert.equal(apartamento.tipoSelecionado, 'apartamento');
  assert.deepEqual(apartamento.totais, { ativos: 3, entradas: 3, saidas: 0 });
  assert.ok(apartamento.registros.every(row => row.tipo === 'apartamento'));
  for (const visao of ['ativos', 'entradas', 'saidas']) {
    const result = consultarDados(data, params({ tipo: 'sala', visao }));
    assert.ok(result.registros.length > 0);
    assert.ok(result.registros.every(row => row.tipo === 'sala'));
  }
  assert.equal(consultarDados(data, params()).totais.ativos, 5);
  assert.throws(() => consultarDados(data, params({ tipo: 'Tipo nao cadastrado' })), /selecione um tipo principal/);
});

test('catalogo sem principal unico falha explicitamente sem criar opcoes conflitantes', async t => {
  const dir = await fixture(t, { 'jfTeste.json': [record('A')] });
  const catalogPath = path.join(dir, 'catalogo.json');
  for (const aliases of [
    [{ nome: 'Sala', principal: 'nao' }],
    [{ nome: 'Sala', principal: 'sim' }, { nome: 'Conjunto', principal: 'sim' }],
  ]) {
    await writeFile(catalogPath, JSON.stringify({ tiposPorSlug: { sala: aliases } }));
    await assert.rejects(carregarDados(dir, catalogPath), /sala precisa de um unico nome principal/);
  }
});

test('permanencia usa hoje para ativos e retirada para historico, sem inventar datas', async t => {
  const dir = await fixture(t, {
    'jfTeste.json': [
      record('ativo'),
      record('hoje', { dataInclusao: '2026-11-27' }),
      record('futuro', { dataInclusao: '2026-11-28' }),
      record('sem-inclusao', { dataInclusao: '' }),
    ],
    'jfTesteRetiradosVendas.json': [
      record('retirado', { dataExclusao: '2026-11-25' }),
      record('mesmo-dia', { dataExclusao: '2026-11-21' }),
      record('invertido', { dataExclusao: '2026-11-20' }),
      record('sem-saida'),
    ],
  });
  const data = await carregarDados(dir);
  const agora = new Date('2026-11-28T01:00:00Z');
  const entradas = consultarDados(data, params(), agora);
  const dias = Object.fromEntries(entradas.registros.map(row => [row.codigo, row.permanenciaDias]));
  assert.equal(entradas.referenciaPermanencia, '2026-11-27');
  assert.deepEqual(dias, { hoje: 0, ativo: 6, 'mesmo-dia': 0, retirado: 4, 'sem-saida': null, invertido: null });
  const ativos = consultarDados(data, params({ visao: 'ativos' }), agora);
  const ativosDias = Object.fromEntries(ativos.registros.map(row => [row.codigo, row.permanenciaDias]));
  assert.equal(ativosDias.futuro, null);
  assert.equal(ativosDias['sem-inclusao'], null);
  assert.equal(consultarDados(data, params({ visao: 'saidas' }), agora).registros.find(row => row.codigo === 'retirado').permanenciaDias, 4);
});

test('servidor limita rotas a leitura e nao expoe arquivos do backend', async t => {
  const server = criarServidor();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(base);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Movimentacao de imoveis/);
  for (const route of ['/entradas', '/saidas', '/ativos']) {
    assert.equal((await fetch(`${base}${route}`)).status, 200);
  }
  assert.equal((await fetch(`${base}/.env`)).status, 404);
  assert.equal((await fetch(`${base}/dados.js`)).status, 404);
  assert.equal((await fetch(`${base}/api/relatorio`, { method: 'POST' })).status, 405);
});
