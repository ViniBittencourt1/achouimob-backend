import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Storage } from '@google-cloud/storage';
import { JsonStorage } from './jsonStorage.js';
import { OperationalStore, StaleSnapshotError } from './operationalStore.js';
import { LockLostError, TransactionStore } from './transactionStore.js';
import { runUniversalSalesGcs } from '../../../_01extractor/crawlers/jfora/universal/gcsVendas.js';
import { deliverReport, retryPendingReports } from './reportSheets.js';
import { prepareUniversalPilot } from './prepareUniversalPilot.js';
import { fakeSheets, memoryStorage, pilotValues } from './pilotTestSupport.js';

function cleanupTestScope(t, bucket, prefix) {
  t.after(async () => {
    const [files] = await bucket.getFiles({ prefix });
    for (const file of files) {
      if (!file.name.startsWith(prefix)) throw new Error('Objeto fora do prefixo de teste.');
      const [metadata] = await file.getMetadata();
      const generation = Number(metadata.generation);
      if (!Number.isSafeInteger(generation) || generation <= 0) throw new Error('Geracao invalida na limpeza.');
      await bucket.file(file.name, { preconditionOpts: { ifGenerationMatch: generation } }).delete();
    }
  });
}

test('concorrencia e recuperacao no bucket GCS', {
  skip: process.env.GCS_INTEGRATION_TESTS !== '1',
  timeout: 120000,
}, async t => {
  assert.ok(process.env.GCS_BUCKET, 'Informe GCS_BUCKET para o teste de integracao.');
  const bucket = new Storage().bucket(process.env.GCS_BUCKET);
  const scope = `teste-${randomUUID()}`;
  const prefix = `controles/transacoes/${scope}/`;
  cleanupTestScope(t, bucket, prefix);

  const clocks = [Date.now(), Date.now()];
  const stores = clocks.map((_, i) => new TransactionStore({
    storage: new JsonStorage({ bucket }),
    scope,
    computerId: `teste-pc-${i}`,
    clock: () => clocks[i],
  }));
  const attempts = await Promise.allSettled(stores.map(store => store.acquire(1000)));
  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
  const winner = attempts.findIndex(result => result.status === 'fulfilled');
  const other = 1 - winner;
  let lease = attempts[winner].value;
  const first = await stores[winner].stage(lease, { valor: 1 });
  lease = (await stores[winner].commit(lease, { imoveis: first })).lease;
  const stale = await stores[winner].stage(lease, { valor: 2 });
  clocks[other] = lease.expiresAt;
  let next = await stores[other].acquire(5000);
  await assert.rejects(stores[winner].commit(lease, { imoveis: stale }), LockLostError);
  assert.deepEqual(await stores[other].readDocument(await stores[other].current(), 'imoveis'), { valor: 1 });
  const replacement = await stores[other].stage(next, { valor: 3 });
  next = (await stores[other].commit(next, { imoveis: replacement })).lease;
  assert.deepEqual(await stores[winner].readDocument(await stores[winner].current(), 'imoveis'), { valor: 3 });
  await stores[other].release(next);
});

test('operacao auditada e relatorio pendente persistem no bucket GCS', {
  skip: process.env.GCS_INTEGRATION_TESTS !== '1',
  timeout: 120000,
}, async t => {
  assert.ok(process.env.GCS_BUCKET, 'Informe GCS_BUCKET para o teste de integracao.');
  const bucket = new Storage().bucket(process.env.GCS_BUCKET);
  const scope = `teste-operacao-${randomUUID()}`;
  cleanupTestScope(t, bucket, `controles/transacoes/${scope}/`);
  const a = new TransactionStore({ storage: new JsonStorage({ bucket }), scope, computerId: 'teste-pc-a' });
  const b = new TransactionStore({ storage: new JsonStorage({ bucket }), scope, computerId: 'teste-pc-b' });
  let lease = await a.acquire(60000);
  const initial = await a.stage(lease, [{ linkReal: 'anterior' }]);
  lease = (await a.commit(lease, { 'crawler/vendas.json': initial })).lease;
  await a.release(lease);
  const first = new OperationalStore({ transaction: a });
  const second = new OperationalStore({ transaction: b });
  const stale = await second.read(['crawler/vendas.json']);
  const operationId = randomUUID();
  const result = await first.commit(await first.read(['crawler/vendas.json']), {
    operationId, type: 'raspagem', actor: 'teste', changes: { 'crawler/vendas.json': [{ linkReal: 'novo' }] },
    report: { novos: 1 },
  });
  const verified = await second.read(['crawler/vendas.json', result.auditKey, result.reportKey]);
  assert.equal(verified.revision, 2);
  assert.deepEqual(verified.values['crawler/vendas.json'], [{ linkReal: 'novo' }]);
  assert.equal(verified.values[result.auditKey].operationId, operationId);
  assert.equal(verified.values[result.reportKey].status, 'pendente');
  assert.deepEqual(verified.values[result.reportKey].data, { novos: 1 });
  await assert.rejects(second.commit(stale, {
    operationId: randomUUID(), type: 'raspagem', actor: 'teste', changes: { 'crawler/vendas.json': [] }, report: {},
  }), StaleSnapshotError);
  assert.equal((await a.state()).data.lease, null);
});

test('piloto Universal e reprocessamento persistem no GCS com dados sinteticos', {
  skip: process.env.GCS_INTEGRATION_TESTS !== '1',
  timeout: 240000,
}, async t => {
  assert.ok(process.env.GCS_BUCKET, 'Informe GCS_BUCKET para o teste de integracao.');
  const bucket = new Storage().bucket(process.env.GCS_BUCKET);
  const scope = `piloto-jfuniversal-teste-${randomUUID()}`;
  cleanupTestScope(t, bucket, `controles/transacoes/${scope}/`);
  const transaction = new TransactionStore({ storage: new JsonStorage({ bucket }), scope, computerId: 'teste-pc' });
  const source = new TransactionStore({ storage: memoryStorage(), scope: 'base-preparacao-inicial', computerId: 'teste-pc' });
  let lease = await source.acquire(120000);
  const documents = {};
  for (const [key, value] of Object.entries(pilotValues())) documents[key] = await source.stage(lease, value);
  lease = (await source.commit(lease, documents)).lease;
  await source.release(lease);
  const prepared = await prepareUniversalPilot({ source, destination: transaction, actor: 'teste' });
  assert.equal(prepared.revision, 1);
  const store = new OperationalStore({ transaction });
  const api = fakeSheets();
  const operationId = randomUUID();
  const result = await runUniversalSalesGcs({
    store, operationId, actor: 'teste',
    collect: async () => ({ totalEsperado: 1, imoveis: [{ linkReal: 'https://universalimoveis.com.br//imovel/1', codigoBase: '1', preco: 300 }] }),
    report: async id => deliverReport({
      store, operationId: id, spreadsheetId: 'planilha-teste', actor: 'teste',
      api: { ...api, writeSheet: async () => { throw new Error('Sheets indisponivel'); } },
    }),
  });
  assert.match(result.reportWarning, /Sheets indisponivel/);
  const pending = await store.read(['crawler/jfUniversal.json', 'crawler/jfUniversalRetiradosVendas.json', result.reportKey]);
  assert.equal(pending.values['crawler/jfUniversal.json'][0].preco, 123);
  assert.equal(pending.values['crawler/jfUniversalRetiradosVendas.json'].length, 2);
  assert.equal(pending.values[result.reportKey].status, 'pendente');
  assert.deepEqual(await retryPendingReports({ store, spreadsheetId: 'planilha-teste', actor: 'teste', api }), [{ status: 'entregue', operationId }]);
  assert.equal((await store.read([result.reportKey])).values[result.reportKey].status, 'entregue');
  assert.equal((await transaction.state()).data.lease, null);
});
