import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage, pilotValues } from './pilotTestSupport.js';
import { TransactionStore } from './transactionStore.js';
import { OperationalStore } from './operationalStore.js';
import { randomUUID } from 'node:crypto';
import { prepareUniversalPilot } from './prepareUniversalPilot.js';
import { prepareJfSharedPilot } from './prepareJfSharedPilot.js';
import { runUniversalRentGcs, UNIVERSAL_RENT_DOCUMENTS } from '../../../_01extractor/crawlers/jfora/universal/gcsLocacao.js';

async function setup() {
  const storage = memoryStorage();
  const transaction = scope => new TransactionStore({ storage, scope, computerId: 'pc' });
  const source = transaction('base-preparacao-inicial');
  const universal = transaction('piloto-jfuniversal-teste');
  const shared = transaction('piloto-jf-compartilhado-teste');
  const link = 'https://universalimoveis.com.br/imovel/1';
  const data = {
    ...pilotValues(),
    'crawler/jfUniversalLocacao.json': [
      { linkReal: link, codigoBase: '1', preco: 1000, dataInclusao: '2020-01-01' },
      { linkReal: 'https://universalimoveis.com.br/imovel/2', codigoBase: '2', preco: 2000 },
    ],
    'crawler/jfUniversalRetiradosLocacao.json': [{ retiradaId: 'antigo' }],
    '_03database/outros/alugueis-bairro-correcoes.json': [{ file: 'jfUniversalLocacao.json', linkReal: link, bairro: 'centro', cidade: 'cidade-bairro' }],
    '_03database/outros/alugueis-cidade-correcoes.json': [{ file: 'jfUniversalLocacao.json', linkReal: link, cidade: 'cidade-final' }],
    '_03database/outros/alugueis-tipo-imovel-correcoes.json': [{ file: 'jfUniversalLocacao.json', linkReal: link, tipoImovel: 'casa' }],
    '_03database/outros/alugueis-linkfoto-correcoes.json': [{ file: 'jfUniversalLocacao.json', linkReal: link, linkFoto: 'foto-corrigida' }],
  };
  let lease = await source.acquire(60000);
  const documents = {};
  for (const [key, value] of Object.entries(data)) documents[key] = await source.stage(lease, value);
  lease = (await source.commit(lease, documents)).lease;
  await source.release(lease);
  await prepareUniversalPilot({ source, destination: universal, actor: 'operador' });
  await prepareJfSharedPilot({ source, universal, destination: shared, actor: 'operador' });
  return { store: new OperationalStore({ transaction: shared }), shared, universal };
}

test('aluguel usa correcoes GCS, preserva historico e nao modifica vendas', async () => {
  const { store, universal } = await setup();
  const result = await runUniversalRentGcs({ store, actor: 'operador', collect: async ({ catalogos }) => {
    assert.equal(catalogos.cidades[0].slug, 'cidade-teste');
    return { totalEsperado: 1, imoveis: [{
      linkReal: 'https://universalimoveis.com.br/imovel/1', codigoBase: '1', preco: 1200, precoTotal: 1500,
    }] };
  } });
  const snapshot = await store.read([...UNIVERSAL_RENT_DOCUMENTS, result.reportKey, 'crawler/jfUniversal.json']);
  const item = snapshot.values['crawler/jfUniversalLocacao.json'][0];
  assert.equal(item.dataInclusao, '2020-01-01');
  assert.equal(item.bairro, 'centro');
  assert.equal(item.cidade, 'cidade-final');
  assert.equal(item.tipoImovel, 'casa');
  assert.equal(item.linkFoto, 'foto-corrigida');
  assert.equal(item.precoTotal, 1500);
  assert.equal(snapshot.values['crawler/jfUniversalRetiradosLocacao.json'].length, 2);
  assert.equal(snapshot.values[result.reportKey].status, 'pendente');
  assert.equal(snapshot.values['crawler/jfUniversal.json'].length, 2);
  assert.equal((await universal.current()).revision, 1);
});

test('coleta parcial ou duplicada nao altera base de aluguel', async () => {
  const { store, shared } = await setup();
  const link = 'https://universalimoveis.com.br/imovel/1';
  for (const data of [
    { totalEsperado: 2, imoveis: [{ linkReal: link, preco: 100 }] },
    { totalEsperado: 2, imoveis: [{ linkReal: link, preco: 100 }, { linkReal: link, preco: 100 }] },
  ]) await assert.rejects(runUniversalRentGcs({ store, actor: 'operador', collect: async () => data }));
  assert.equal((await shared.current()).revision, 1);
});

test('mudanca concorrente de correcoes cancela a coleta sem sobrescrever dados', async () => {
  const { store, shared } = await setup();
  const key = '_03database/outros/alugueis-cidade-correcoes.json';
  const collect = async () => {
    const snapshot = await store.read([key]);
    await store.commit(snapshot, { operationId: randomUUID(), actor: 'outro', type: 'correcao',
      changes: { [key]: [] }, report: {} });
    return { totalEsperado: 1, imoveis: [{ linkReal: 'https://universalimoveis.com.br/imovel/1', preco: 100 }] };
  };
  await assert.rejects(runUniversalRentGcs({ store, actor: 'operador', collect }), /base mudou/i);
  const snapshot = await store.read(['crawler/jfUniversalLocacao.json', key]);
  assert.equal((await shared.current()).revision, 2);
  assert.equal(snapshot.values['crawler/jfUniversalLocacao.json'].length, 2);
  assert.deepEqual(snapshot.values[key], []);
});
