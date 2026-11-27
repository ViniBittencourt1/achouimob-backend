import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage, pilotValues } from './pilotTestSupport.js';
import { TransactionStore } from './transactionStore.js';
import { OperationalStore } from './operationalStore.js';
import { prepareUniversalPilot } from './prepareUniversalPilot.js';
import { prepareJfSharedPilot } from './prepareJfSharedPilot.js';
import { runAlmarGcs } from '../../../_01extractor/crawlers/jfora/almar/gcs.js';
import { consolidateData as almarConsolidate } from '../../../_01extractor/crawlers/jfora/almar/parser.js';
import { consolidateData as universalConsolidate } from '../../../_01extractor/crawlers/jfora/universal/parser.js';

async function setup() {
  const storage = memoryStorage();
  const tx = scope => new TransactionStore({ storage, scope, computerId: 'pc' });
  const source = tx('base-preparacao-inicial');
  const pilot = tx('piloto-jfuniversal-teste');
  const shared = tx('piloto-jf-compartilhado-teste');
  const link = 'https://grupoalmar.com.br/imovel/1';
  const data = {
    ...pilotValues(),
    'crawler/jfAlmar.json': [{ linkReal: link, codigoBase: '1', preco: 100, dataInclusao: '2020-01-01' }],
    'crawler/jfAlmarRetiradosVendas.json': [{ retiradaId: 'venda-anterior' }],
    'crawler/jfAlmarLocacao.json': [
      { linkReal: link, codigoBase: '1', preco: 1000, dataInclusao: '2020-01-01' },
      { linkReal: 'https://grupoalmar.com.br/imovel/2', codigoBase: '2', preco: 1200 },
    ],
    'crawler/jfAlmarRetiradosLocacao.json': [{ retiradaId: 'aluguel-anterior' }],
    '_03database/outros/alugueis-bairro-correcoes.json': [{ file: 'jfAlmarLocacao.json', linkReal: link, bairro: 'centro', cidade: 'cidade' }],
    '_03database/outros/alugueis-cidade-correcoes.json': [],
    '_03database/outros/alugueis-tipo-imovel-correcoes.json': [],
    '_03database/outros/alugueis-linkfoto-correcoes.json': [],
  };
  let lease = await source.acquire(60000);
  const docs = {};
  for (const [key, value] of Object.entries(data)) docs[key] = await source.stage(lease, value);
  lease = (await source.commit(lease, docs)).lease;
  await source.release(lease);
  await prepareUniversalPilot({ source, destination: pilot, actor: 'operador' });
  await prepareJfSharedPilot({ source, universal: pilot, destination: shared, actor: 'operador' });
  return { store: new OperationalStore({ transaction: shared }), shared };
}

test('a consolidacao compartilhada preserva as regras de vendas Almar', () => {
  const old = [
    { linkReal: 'https://grupoalmar.com.br/imovel/1', dataInclusao: '2020-01-01', linkCard: 'existente', preco: 1 },
    { linkReal: 'https://grupoalmar.com.br/imovel/2', preco: 2 },
  ];
  const items = [
    { linkReal: old[0].linkReal, dataInclusao: 'hoje', linkCard: 'novo', preco: 3 },
    { linkReal: 'https://grupoalmar.com.br/imovel/3', preco: 4 },
  ];
  const createMap = () => new Map(structuredClone(old).map(item => [item.linkReal, item]));
  assert.deepEqual(almarConsolidate(structuredClone(items), createMap()), universalConsolidate(structuredClone(items), createMap()));
});

test('Almar preserva projetos, correcoes e historico nas duas negociacoes', async () => {
  const { store } = await setup();
  const collect = async ({ catalogos }) => {
    assert.equal(catalogos.cidades[0].slug, 'cidade-teste');
    return { totalEsperado: 1, imoveis: [{ linkReal: 'https://grupoalmar.com.br/imovel/1', codigoBase: '1', preco: 200 }] };
  };
  const venda = await runAlmarGcs({ store, actor: 'operador', negociacao: 'venda', collect });
  const aluguel = await runAlmarGcs({ store, actor: 'operador', negociacao: 'aluguel', collect });
  const snapshot = await store.read([
    'crawler/jfAlmar.json', 'crawler/jfAlmarLocacao.json', 'crawler/jfAlmarRetiradosLocacao.json',
    'crawler/jfUniversal.json', venda.reportKey, aluguel.reportKey,
  ]);
  assert.equal(snapshot.values['crawler/jfAlmar.json'][0].preco, 200);
  assert.equal(snapshot.values['crawler/jfAlmarLocacao.json'][0].bairro, 'centro');
  assert.equal(snapshot.values['crawler/jfAlmarLocacao.json'][0].dataInclusao, '2020-01-01');
  assert.equal(snapshot.values['crawler/jfAlmarRetiradosLocacao.json'].length, 2);
  assert.equal(snapshot.values['crawler/jfUniversal.json'].length, 2);
  assert.equal(snapshot.values[venda.reportKey].status, 'pendente');
  assert.equal(snapshot.values[aluguel.reportKey].status, 'pendente');
});

test('Almar rejeita links de outros dominios e contagens incompletas', async () => {
  const { store, shared } = await setup();
  for (const data of [
    { totalEsperado: 2, imoveis: [{ linkReal: 'https://grupoalmar.com.br/imovel/1', preco: 100 }] },
    { totalEsperado: 1, imoveis: [{ linkReal: 'https://universalimoveis.com.br/imovel/1', preco: 100 }] },
  ]) {
    for (const negociacao of ['venda', 'aluguel']) {
      await assert.rejects(runAlmarGcs({ store, actor: 'operador', negociacao, collect: async () => data }));
    }
  }
  assert.equal((await shared.current()).revision, 1);
});
