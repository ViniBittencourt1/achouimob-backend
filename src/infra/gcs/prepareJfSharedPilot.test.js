import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { memoryStorage, pilotValues } from './pilotTestSupport.js';
import { TransactionStore } from './transactionStore.js';
import { OperationalStore } from './operationalStore.js';
import { prepareUniversalPilot } from './prepareUniversalPilot.js';
import { prepareJfSharedPilot } from './prepareJfSharedPilot.js';
import { runUniversalSalesGcs } from '../../../_01extractor/crawlers/jfora/universal/gcsVendas.js';

async function setup() {
  const storage = memoryStorage();
  const transaction = scope => new TransactionStore({ storage, scope, computerId: 'pc' });
  const source = transaction('base-preparacao-inicial');
  const universal = transaction('piloto-jfuniversal-teste');
  const destination = transaction('piloto-jf-compartilhado-teste');
  let lease = await source.acquire(60000);
  const data = { ...pilotValues(), 'crawler/jfOutro.json': [{ linkReal: 'https://example.com/venda' }],
    'crawler/jfOutroLocacao.json': [{ linkReal: 'https://example.com/aluguel' }] };
  const documents = {};
  for (const [key, value] of Object.entries(data)) documents[key] = await source.stage(lease, value);
  lease = (await source.commit(lease, documents)).lease;
  await source.release(lease);
  await prepareUniversalPilot({ source, destination: universal, actor: 'operador' });
  const store = new OperationalStore({ transaction: universal });
  const operationId = randomUUID();
  const key = 'crawler/jfUniversal.json';
  const snapshot = await store.read([key]);
  await store.commit(snapshot, { operationId, type: 'raspagem', actor: 'operador',
    changes: { [key]: [{ linkReal: 'https://universalimoveis.com.br/imovel/atual' }] }, report: { ativos: 1 } });
  return { source, universal, destination, operationId };
}

test('prepara base isolada com ambos os negocios e ultima Universal, arquivando auditoria', async () => {
  const { source, universal, destination, operationId } = await setup();
  const result = await prepareJfSharedPilot({ source, universal, destination, actor: 'operador' });
  const manifest = await destination.current();
  assert.equal(result.revision, 1);
  assert.equal(result.universalRevision, 2);
  assert.deepEqual(await destination.readDocument(manifest, 'crawler/jfOutro.json'), [{ linkReal: 'https://example.com/venda' }]);
  assert.deepEqual(await destination.readDocument(manifest, 'crawler/jfOutroLocacao.json'), [{ linkReal: 'https://example.com/aluguel' }]);
  assert.equal((await destination.readDocument(manifest, 'crawler/jfUniversal.json'))[0].linkReal,
    'https://universalimoveis.com.br/imovel/atual');
  const archived = await destination.readDocument(manifest, `_piloto-jf/universal-anterior/controles/operacoes/${operationId}.json`);
  assert.equal(archived.operationId, operationId);
  assert.equal(Object.hasOwn(manifest.documents, `controles/operacoes/${operationId}.json`), false);
  const origin = await destination.readDocument(manifest, '_piloto-jf/origem.json');
  assert.equal(origin.status, 'isolado-nao-oficial');
  assert.equal((await source.current()).revision, 1);
  assert.equal((await universal.current()).revision, 2);
});

test('nao sobrescreve base existente', async () => {
  const options = { ...await setup(), actor: 'operador' };
  await prepareJfSharedPilot(options);
  await assert.rejects(prepareJfSharedPilot(options), /ja existe/);
  assert.equal((await options.destination.current()).revision, 1);
});

test('Universal funciona no escopo compartilhado sem alterar o piloto anterior', async () => {
  const { source, universal, destination } = await setup();
  await prepareJfSharedPilot({ source, universal, destination, actor: 'operador' });
  const store = new OperationalStore({ transaction: destination });
  const result = await runUniversalSalesGcs({ store, actor: 'operador', collect: async () => ({
    totalEsperado: 1, imoveis: [{ linkReal: 'https://universalimoveis.com.br/imovel/atual', preco: 300 }],
  }) });
  assert.equal(result.summary.ativos, 1);
  assert.equal((await destination.current()).revision, 2);
  assert.equal((await universal.current()).revision, 2);
});

test('mudanca na base preparada cancela confirmacao e libera locks', async () => {
  const options = { ...await setup(), actor: 'operador' };
  const state = options.source.state.bind(options.source);
  let calls = 0;
  options.source.state = async () => {
    const current = await state();
    if (++calls === 3) current.data.revision++;
    return current;
  };
  await assert.rejects(prepareJfSharedPilot(options), /Base preparada mudou/);
  assert.equal(await options.destination.current(), null);
  assert.equal((await options.universal.state()).data.lease, null);
  assert.equal((await options.destination.state()).data.lease, null);
});
