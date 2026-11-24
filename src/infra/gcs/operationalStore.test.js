import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { ConcurrentModificationError } from './jsonStorage.js';
import { OperationalStore, StaleSnapshotError } from './operationalStore.js';
import { TransactionStore } from './transactionStore.js';

function fakeStorage() {
  const current = new Map();
  const versions = new Map();
  let generation = 0;
  return {
    async read(name) {
      const item = current.get(name);
      if (!item) throw Object.assign(new Error('not found'), { code: 404 });
      return { data: structuredClone(item.data), generation: item.generation };
    },
    async readVersion(name, gen) {
      const item = versions.get(`${name}:${gen}`);
      if (!item) throw Object.assign(new Error('not found'), { code: 404 });
      return { data: structuredClone(item), generation: gen };
    },
    async write(name, data, { expectedGeneration }) {
      if ((current.get(name)?.generation || '0') !== String(expectedGeneration)) {
        throw new ConcurrentModificationError(name);
      }
      const gen = String(++generation);
      const cloned = structuredClone(data);
      current.set(name, { generation: gen, data: cloned });
      versions.set(`${name}:${gen}`, cloned);
      return { generation: gen };
    },
  };
}

async function setup() {
  const storage = fakeStorage();
  let now = 100000;
  const make = computerId => new TransactionStore({ storage, scope: 'teste', computerId, clock: () => now });
  const a = make('pc-a');
  const b = make('pc-b');
  let lease = await a.acquire(60000);
  const active = await a.stage(lease, [{ linkReal: 'antigo' }]);
  const correction = await a.stage(lease, { cidade: 'niteroi-rj' });
  lease = (await a.commit(lease, { 'crawler/vendas.json': active, 'correcoes/cidade.json': correction })).lease;
  await a.release(lease);
  return { storage, a, b, first: new OperationalStore({ transaction: a }), second: new OperationalStore({ transaction: b }), setTime: value => { now = value; } };
}

test('confirma dados, auditoria e relatorio pendente na mesma revisao, preservando correcoes', async () => {
  const { first, second, a } = await setup();
  const snapshot = await first.read(['crawler/vendas.json', 'correcoes/cidade.json']);
  const operationId = randomUUID();
  const result = await first.commit(snapshot, {
    operationId, type: 'raspagem', actor: 'operador',
    changes: { 'crawler/vendas.json': [{ linkReal: 'novo', cidade: snapshot.values['correcoes/cidade.json'].cidade }], 'historicos/retirados.json': [{ linkReal: 'antigo' }] },
    report: { novos: 1, retirados: 1 },
  });
  const next = await second.read(['crawler/vendas.json', 'correcoes/cidade.json', 'historicos/retirados.json', result.auditKey, result.reportKey]);
  assert.equal(next.revision, 2);
  assert.deepEqual(next.values['crawler/vendas.json'], [{ linkReal: 'novo', cidade: 'niteroi-rj' }]);
  assert.deepEqual(next.values['correcoes/cidade.json'], { cidade: 'niteroi-rj' });
  assert.deepEqual(next.values['historicos/retirados.json'], [{ linkReal: 'antigo' }]);
  assert.equal(next.values[result.auditKey].computerId, 'pc-a');
  assert.equal(next.values[result.auditKey].actor, 'operador');
  assert.equal(next.values[result.auditKey].previousRevision, 1);
  assert.deepEqual(next.values[result.reportKey].data, { novos: 1, retirados: 1 });
  assert.equal(next.values[result.reportKey].status, 'pendente');
  assert.equal((await a.state()).data.lease, null);
});

test('descarta operacao preparada sobre revisao anterior sem sobrescrever dados', async () => {
  const { first, second } = await setup();
  const original = await first.read(['crawler/vendas.json']);
  await second.commit(await second.read(['correcoes/cidade.json']), {
    operationId: randomUUID(), type: 'correcao', actor: 'operador', changes: { 'correcoes/cidade.json': { cidade: 'rio-rj' } }, report: {},
  });
  await assert.rejects(first.commit(original, {
    operationId: randomUUID(), type: 'raspagem', actor: 'operador', changes: { 'crawler/vendas.json': [] }, report: {},
  }), StaleSnapshotError);
  const after = await first.read(['crawler/vendas.json', 'correcoes/cidade.json']);
  assert.equal(after.revision, 2);
  assert.deepEqual(after.values['crawler/vendas.json'], [{ linkReal: 'antigo' }]);
  assert.equal(after.values['correcoes/cidade.json'].cidade, 'rio-rj');
});

test('documentos ausentes, caminhos reservados e valores JSON invalidos falham explicitamente', async () => {
  const { first, a } = await setup();
  await assert.rejects(first.read(['ausente.json']), /Documento obrigatorio ausente/);
  const snapshot = await first.read(['crawler/vendas.json']);
  for (const changes of [
    { 'controles/operacoes/falso.json': {} },
    { '__proto__/x.json': {} },
    { 'crawler/vendas.json': { campo: undefined } },
    { 'crawler/vendas.json': [NaN] },
  ]) {
    await assert.rejects(first.commit(snapshot, { operationId: randomUUID(), type: 'raspagem', actor: 'operador', changes, report: {} }));
  }
  assert.equal((await a.current()).revision, 1);
  assert.equal((await a.state()).data.lease, null);
});

test('interrupcao durante preparacao nao confirma dados nem relatorio', async () => {
  const { first, a, storage } = await setup();
  const snapshot = await first.read(['crawler/vendas.json']);
  const write = storage.write.bind(storage);
  let staged = 0;
  storage.write = async (name, data, options) => {
    if (name.includes('/dados/') && ++staged === 2) throw new Error('falha simulada');
    return write(name, data, options);
  };
  await assert.rejects(first.commit(snapshot, {
    operationId: randomUUID(), type: 'raspagem', actor: 'operador',
    changes: { 'crawler/vendas.json': [{ linkReal: 'novo' }] }, report: {},
  }), /falha simulada/);
  const after = await first.read(['crawler/vendas.json']);
  assert.equal(after.revision, 1);
  assert.deepEqual(after.values['crawler/vendas.json'], [{ linkReal: 'antigo' }]);
  assert.equal((await a.state()).data.lease, null);
});

test('nao reaplica operacao ja confirmada', async () => {
  const { first } = await setup();
  const id = randomUUID();
  const request = { operationId: id, type: 'correcao', actor: 'operador', changes: { 'correcoes/cidade.json': { cidade: 'rio-rj' } }, report: {} };
  await first.commit(await first.read(['correcoes/cidade.json']), request);
  await assert.rejects(first.commit(await first.read(['correcoes/cidade.json']), request), /Operacao ja registrada/);
  assert.equal((await first.read(['correcoes/cidade.json'])).revision, 2);
});

test('resposta perdida exige consulta da operacao persistida antes de retomar', async () => {
  const { first, second, storage, setTime } = await setup();
  const snapshot = await first.read(['crawler/vendas.json']);
  const operationId = randomUUID();
  const write = storage.write.bind(storage);
  let injected = false;
  storage.write = async (name, data, options) => {
    const saved = await write(name, data, options);
    if (!injected && name.endsWith('/estado.json') && data.revision === 2) {
      injected = true;
      throw new Error('resposta perdida');
    }
    return saved;
  };
  const request = { operationId, type: 'raspagem', actor: 'operador', changes: { 'crawler/vendas.json': [{ linkReal: 'novo' }] }, report: {} };
  await assert.rejects(first.commit(snapshot, request), AggregateError);
  const auditKey = `controles/operacoes/${operationId}.json`;
  const reportKey = `controles/relatorios/${operationId}.json`;
  const confirmed = await second.read(['crawler/vendas.json', auditKey, reportKey]);
  assert.equal(confirmed.revision, 2);
  assert.deepEqual(confirmed.values['crawler/vendas.json'], [{ linkReal: 'novo' }]);
  assert.equal(confirmed.values[reportKey].status, 'pendente');
  setTime(1000001);
  await assert.rejects(second.commit(confirmed, request), /Operacao ja registrada/);
});

test('nao aceita snapshot de outro escopo nem altera a base de preparacao', async () => {
  const { first, storage } = await setup();
  const snapshot = await first.read(['crawler/vendas.json']);
  const request = { operationId: randomUUID(), type: 'raspagem', actor: 'operador', changes: { 'crawler/vendas.json': [] }, report: {} };
  await assert.rejects(first.commit({ ...snapshot, scope: 'outro' }, request), /invalidos/);
  const preparation = new OperationalStore({ transaction: new TransactionStore({ storage, scope: 'base-preparacao-inicial', computerId: 'pc-a' }) });
  await assert.rejects(preparation.commit({ ...snapshot, scope: 'base-preparacao-inicial' }, request), /nao esta ativa/);
});
