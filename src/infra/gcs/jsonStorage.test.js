import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConcurrentModificationError, JsonStorage } from './jsonStorage.js';

function fakeBucket() {
  const objects = new Map();
  let nextGeneration = 1;
  return {
    file(name, options = {}) {
      return {
        async getMetadata() {
          const current = objects.get(name);
          if (!current) throw Object.assign(new Error('not found'), { code: 404 });
          return [{ generation: String(current.generation) }];
        },
        async download() {
          const current = objects.get(name);
          if (!current || current.generation !== options.generation) {
            throw Object.assign(new Error('generation not found'), { code: 404 });
          }
          return [current.data];
        },
        async save(data, options) {
          const current = objects.get(name);
          if ((current?.generation || 0) !== options.preconditionOpts.ifGenerationMatch) {
            throw Object.assign(new Error('precondition failed'), { code: 412 });
          }
          const generation = nextGeneration++;
          objects.set(name, { generation, data });
          this.metadata = { generation: String(generation) };
        },
      };
    },
  };
}

test('grava e le JSON por geracao e bloqueia atualizacao concorrente', async () => {
  const store = new JsonStorage({ bucket: fakeBucket() });
  const first = await store.write('crawler/vendas/jfTeste.json', { valor: 1 }, { expectedGeneration: 0 });
  const read = await store.read('crawler/vendas/jfTeste.json');
  assert.deepEqual(read, { data: { valor: 1 }, generation: first.generation });
  const next = await store.write('crawler/vendas/jfTeste.json', { valor: 2 }, { expectedGeneration: first.generation });
  assert.deepEqual(await store.readVersion('crawler/vendas/jfTeste.json', next.generation), { data: { valor: 2 }, generation: next.generation });
  await assert.rejects(store.write('crawler/vendas/jfTeste.json', { valor: 3 }, { expectedGeneration: first.generation }), ConcurrentModificationError);
  await assert.rejects(store.write('crawler/vendas/jfTeste.json', { valor: 3 }, { expectedGeneration: 0 }), ConcurrentModificationError);
  assert.deepEqual(await store.read('crawler/vendas/jfTeste.json'), { data: { valor: 2 }, generation: next.generation });
});

test('rejeita caminhos inseguros, geracoes ausentes ou imprecisas e JSON nao serializavel', async () => {
  const store = new JsonStorage({ bucket: fakeBucket() });
  for (const name of ['', '/absoluto', 'a/../b', 'a\\b', 'a//b']) {
    await assert.rejects(store.write(name, {}, { expectedGeneration: 0 }), /objeto GCS invalido/);
  }
  await assert.rejects(store.write('a.json', {}), /geracao esperada/);
  await assert.rejects(store.write('a.json', {}, { expectedGeneration: '9007199254740993' }), /geracao GCS invalida/i);
  await assert.rejects(store.write('a.json', undefined, { expectedGeneration: 0 }), /serializado/);
  await assert.rejects(store.read('ausente.json'), { code: 404 });
  await assert.rejects(store.readVersion('a.json', '9007199254740993'), /geracao GCS invalida/i);
});

test('le a geracao identificada nos metadados e rejeita JSON corrompido', async () => {
  const calls = [];
  const bucket = {
    file(name, options) {
      calls.push({ name, options });
      return options
        ? { download: async () => [Buffer.from('{invalido')] }
        : { getMetadata: async () => [{ generation: '42' }] };
    },
  };
  await assert.rejects(new JsonStorage({ bucket }).read('dados.json'), /JSON invalido/);
  assert.deepEqual(calls, [
    { name: 'dados.json', options: undefined },
    { name: 'dados.json', options: { generation: 42 } },
  ]);
});
