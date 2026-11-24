import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConcurrentModificationError } from './jsonStorage.js';
import { LockLostError, LockUnavailableError, TransactionStore } from './transactionStore.js';

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

function setup() {
  const storage = fakeStorage();
  let now = 100000;
  const make = computerId => new TransactionStore({ storage, scope: 'vendas', computerId, clock: () => now });
  return { storage, a: make('pc-a'), b: make('pc-b'), setTime: value => { now = value; } };
}

test('aquisicoes simultaneas so permitem um vencedor', async () => {
  const { a, b } = setup();
  const results = await Promise.allSettled([a.acquire(5000), b.acquire(5000)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.ok(results.find(result => result.status === 'rejected').reason instanceof LockLostError);
});

test('confirma varios documentos como uma unica versao e preserva historico', async () => {
  const { a, b } = setup();
  let lease = await a.acquire(5000);
  await assert.rejects(b.acquire(5000), LockUnavailableError);
  const vendas = await a.stage(lease, [{ preco: 10 }]);
  const correcoes = await a.stage(lease, { cidade: 'niteroi-rj' });
  let result = await a.commit(lease, { vendas, correcoes });
  lease = result.lease;
  assert.equal(result.revision, 1);
  const first = await a.current();
  assert.deepEqual(await a.readDocument(first, 'vendas'), [{ preco: 10 }]);
  assert.deepEqual(await a.readDocument(first, 'correcoes'), { cidade: 'niteroi-rj' });
  const changed = await a.stage(lease, [{ preco: 20 }]);
  result = await a.commit(lease, { vendas: changed, correcoes });
  const second = await b.current();
  assert.equal(second.revision, 2);
  assert.ok(second.previous);
  assert.deepEqual(await b.readDocument(second, 'vendas'), [{ preco: 20 }]);
  assert.deepEqual(await b.readDocument(first, 'vendas'), [{ preco: 10 }]);
  await a.release(result.lease);
  assert.ok(await b.acquire(5000));
});

test('expiracao e retomada impedem escritor antigo de confirmar, renovar ou liberar', async () => {
  const { a, b, setTime } = setup();
  const old = await a.acquire(1000);
  const staged = await a.stage(old, { valor: 'antigo' });
  setTime(101000);
  await assert.rejects(a.renew(old, 5000), LockLostError);
  const next = await b.acquire(5000);
  await assert.rejects(a.commit(old, { registro: staged }), LockLostError);
  await assert.rejects(a.release(old), LockLostError);
  assert.equal(await b.current(), null);
  const newDoc = await b.stage(next, { valor: 'novo' });
  const result = await b.commit(next, { registro: newDoc });
  assert.deepEqual(await b.readDocument(await b.current(), 'registro'), { valor: 'novo' });
  await b.release(result.lease);
});

test('renovacao invalida o token de geracao anterior e dados incompletos nao sao confirmados', async () => {
  const { a } = setup();
  const old = await a.acquire(5000);
  const lease = await a.renew(old, 5000);
  await assert.rejects(a.stage(old, { valor: 1 }), LockLostError);
  await assert.rejects(a.commit(lease, {}), /documentos/);
  await assert.rejects(a.commit(lease, { dado: { name: 'outro', generation: '1' } }), /Referencia/);
  assert.equal(await a.current(), null);
  await a.release(lease);
});

test('conflito no instante da confirmacao nao altera a versao publicada', async () => {
  const { a, b, storage, setTime } = setup();
  const old = await a.acquire(1000);
  const staged = await a.stage(old, { valor: 'antigo' });
  const write = storage.write.bind(storage);
  let injected = false;
  storage.write = async (name, data, options) => {
    if (!injected && name.endsWith('/estado.json') && data.current) {
      injected = true;
      setTime(101000);
      await b.acquire(5000);
    }
    return write(name, data, options);
  };
  await assert.rejects(a.commit(old, { registro: staged }), LockLostError);
  assert.equal(await b.current(), null);
});

test('recupera confirmacao persistida quando a resposta da gravacao se perde', async () => {
  const { a, b, storage, setTime } = setup();
  const lease = await a.acquire(1000);
  const doc = await a.stage(lease, { valor: 1 });
  const write = storage.write.bind(storage);
  let injected = false;
  storage.write = async (name, data, options) => {
    const result = await write(name, data, options);
    if (!injected && name.endsWith('/estado.json') && data.current) {
      injected = true;
      throw new Error('resposta perdida');
    }
    return result;
  };
  await assert.rejects(a.commit(lease, { registro: doc }), /resposta perdida/);
  assert.deepEqual(await a.readDocument(await a.current(), 'registro'), { valor: 1 });
  await assert.rejects(a.release(lease), LockLostError);
  setTime(101000);
  const recovered = await b.acquire(5000);
  assert.equal((await b.current()).revision, 1);
  await b.release(recovered);
});
