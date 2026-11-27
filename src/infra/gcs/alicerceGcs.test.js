import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage, pilotValues } from './pilotTestSupport.js';
import { TransactionStore } from './transactionStore.js';
import { OperationalStore } from './operationalStore.js';
import { prepareUniversalPilot } from './prepareUniversalPilot.js';
import { prepareJfSharedPilot } from './prepareJfSharedPilot.js';
import { runAlicerceGcs } from '../../../_01extractor/crawlers/jfora/alicerce/gcs.js';

async function setup() {
  const storage = memoryStorage();
  const tx = scope => new TransactionStore({ storage, scope, computerId: 'pc' });
  const source = tx('base-preparacao-inicial');
  const pilot = tx('piloto-jfuniversal-teste');
  const shared = tx('piloto-jf-compartilhado-teste');
  const link = 'https://alicerceimob.com.br/imovel/1';
  const data = {
    ...pilotValues(),
    'crawler/jfAlicerce.json': [{ linkReal: link, codigoBase: '1', preco: 100, dataInclusao: '2020-01-01' }],
    'crawler/jfAlicerceRetiradosVendas.json': [{ retiradaId: 'venda-anterior' }],
    'crawler/jfAlicerceLocacao.json': [
      { linkReal: link, codigoBase: '1', preco: 1000, dataInclusao: '2020-01-01' },
      { linkReal: 'https://alicerceimob.com.br/imovel/2', codigoBase: '2', preco: 1200 },
    ],
    'crawler/jfAlicerceRetiradosLocacao.json': [{ retiradaId: 'aluguel-anterior' }],
    '_03database/outros/alugueis-bairro-correcoes.json': [{ file: 'jfAlicerceLocacao.json', linkReal: link, bairro: 'centro', cidade: 'cidade' }],
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

test('Alicerce salva vendas e aluguéis no escopo comum sem misturar projetos', async () => {
  const { store } = await setup();
  const collect = async ({ catalogos }) => {
    assert.equal(catalogos.cidades[0].slug, 'cidade-teste');
    return { totalEsperado: 1, imoveis: [{ linkReal: 'https://alicerceimob.com.br/imovel/1', codigoBase: '1', preco: 200 }] };
  };
  const venda = await runAlicerceGcs({ store, actor: 'operador', negociacao: 'venda', collect });
  const aluguel = await runAlicerceGcs({ store, actor: 'operador', negociacao: 'aluguel', collect });
  const snapshot = await store.read([
    'crawler/jfAlicerce.json', 'crawler/jfAlicerceLocacao.json', 'crawler/jfAlicerceRetiradosLocacao.json',
    'crawler/jfUniversal.json', venda.reportKey, aluguel.reportKey,
  ]);
  assert.equal(snapshot.values['crawler/jfAlicerce.json'][0].preco, 200);
  assert.equal(snapshot.values['crawler/jfAlicerceLocacao.json'][0].bairro, 'centro');
  assert.equal(snapshot.values['crawler/jfAlicerceLocacao.json'][0].dataInclusao, '2020-01-01');
  assert.equal(snapshot.values['crawler/jfAlicerceRetiradosLocacao.json'].length, 2);
  assert.equal(snapshot.values['crawler/jfUniversal.json'].length, 2);
  assert.equal(snapshot.values[venda.reportKey].status, 'pendente');
  assert.equal(snapshot.values[aluguel.reportKey].status, 'pendente');
});

test('Alicerce rejeita links de outros dominios e contagens incompletas', async () => {
  const { store, shared } = await setup();
  for (const data of [
    { totalEsperado: 2, imoveis: [{ linkReal: 'https://alicerceimob.com.br/imovel/1', preco: 100 }] },
    { totalEsperado: 1, imoveis: [{ linkReal: 'https://universalimoveis.com.br/imovel/1', preco: 100 }] },
  ]) {
    for (const negociacao of ['venda', 'aluguel']) {
      await assert.rejects(runAlicerceGcs({ store, actor: 'operador', negociacao, collect: async () => data }));
    }
  }
  assert.equal((await shared.current()).revision, 1);
});
