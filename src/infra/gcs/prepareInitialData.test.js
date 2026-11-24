import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createInitialBackup } from './initialBackup.js';
import { JsonStorage } from './jsonStorage.js';
import { prepareInitialData } from './prepareInitialData.js';
import { TransactionStore } from './transactionStore.js';
import { readGeneration } from './verifiedBlob.js';

function fakeBucket() {
  const live = new Map();
  const versions = new Map();
  let generation = 0;
  let failAfter = -1;
  return {
    live, versions,
    failStageAfter(count) { failAfter = count; },
    file(name, options = {}) {
      return {
        async getMetadata() {
          const current = live.get(name);
          if (!current) throw Object.assign(new Error('not found'), { code: 404 });
          return [{ generation: current.generation }];
        },
        async download() {
          const bytes = versions.get(`${name}:${options.generation}`);
          if (!bytes) throw Object.assign(new Error('not found'), { code: 404 });
          return [Buffer.from(bytes)];
        },
        async save(bytes, settings) {
          if (name.includes('/dados/') && failAfter >= 0 && failAfter-- === 0) {
            throw new Error('falha simulada na gravacao');
          }
          const current = live.get(name);
          if (Number(current?.generation || 0) !== settings.preconditionOpts.ifGenerationMatch) {
            throw Object.assign(new Error('precondition'), { code: 412 });
          }
          const gen = String(++generation);
          live.set(name, { generation: gen });
          versions.set(`${name}:${gen}`, Buffer.from(bytes));
          this.metadata = { generation: gen };
        },
      };
    },
  };
}

async function fixture(t, { unexpectedInvalid = false } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'preparacao-gcs-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const primaryRoot = path.join(root, 'original');
  const copyRoot = path.join(root, 'copia');
  const logsParent = path.join(root, 'externo');
  for (const dir of [primaryRoot, copyRoot]) {
    await mkdir(path.join(dir, 'crawler'), { recursive: true });
    await mkdir(path.join(dir, '_03database', 'jfora'), { recursive: true });
    await mkdir(path.join(dir, '_01extractor', 'crawlers', 'jfora', '_1Jf'), { recursive: true });
    await writeFile(path.join(dir, 'crawler', 'imovel.json'), '{"id":123456789012345678901}\n');
    await writeFile(path.join(dir, '_03database', 'jfora', 'jfClientt.json'), '');
    await writeFile(path.join(dir, '_03database', 'catalogo.json'), '[1,2]');
    if (unexpectedInvalid) await writeFile(path.join(dir, '_03database', 'outro.json'), '{');
    await writeFile(path.join(dir, '_01extractor', 'crawlers', 'jfora', '_1Jf', 'extracoes.json'), '{}');
    await writeFile(path.join(dir, '_01extractor', 'crawlers', 'jfora', '_1Jf', 'site-scheduler-config.json'), '{}');
  }
  await writeFile(path.join(copyRoot, 'crawler', 'imovel.json'), '{"copia":true}');
  await mkdir(path.join(logsParent, 'logs'), { recursive: true });
  await writeFile(path.join(logsParent, 'logs', 'historico.json'), '[1]');
  const bucket = fakeBucket();
  await createInitialBackup({ bucket, backupId: 'teste', computerId: 'pc', primaryRoot, copyRoot, logsParent });
  const transaction = new TransactionStore({ storage: new JsonStorage({ bucket }), scope: 'preparacao', computerId: 'pc' });
  return { bucket, transaction, backupId: 'teste' };
}

test('prepara originais byte a byte, preserva invalido no backup e retoma sem nova versao', async t => {
  const args = await fixture(t);
  const result = await prepareInitialData(args);
  assert.equal(result.sourceFiles, 6);
  assert.equal(result.validFiles, 5);
  assert.deepEqual(result.invalidFiles, ['_03database/jfora/jfClientt.json']);
  assert.equal(result.status, 'preparacao-nao-ativa');
  const current = await args.transaction.current();
  const ref = current.documents['crawler/imovel.json'];
  assert.equal((await readGeneration(args.bucket, ref.name, ref.generation)).toString(), '{"id":123456789012345678901}\n');
  assert.equal(current.documents['_03database/jfora/jfClientt.json'], undefined);
  const receipt = await args.transaction.readDocument(current, '_migracao/backup-inicial.json');
  assert.equal(receipt.files.length, 6);
  assert.equal((await prepareInitialData(args)).reused, true);
  assert.equal((await args.transaction.current()).revision, 1);
});

test('falha parcial nao confirma, e retoma reaproveitando objetos verificados', async t => {
  const args = await fixture(t);
  args.bucket.failStageAfter(1);
  await assert.rejects(prepareInitialData(args), /falha simulada/);
  assert.equal(await args.transaction.current(), null);
  const stagedBefore = [...args.bucket.live.keys()].filter(name => name.includes('/dados/'));
  assert.equal(stagedBefore.length, 1);
  const firstGeneration = args.bucket.live.get(stagedBefore[0]).generation;
  await prepareInitialData(args);
  assert.equal(args.bucket.live.get(stagedBefore[0]).generation, firstGeneration);
  assert.equal((await args.transaction.current()).revision, 1);
});

test('interrompe se os bytes do backup divergirem e nao confirma versao', async t => {
  const args = await fixture(t);
  const name = 'backups/importacao-inicial/teste/original/crawler/imovel.json';
  const gen = args.bucket.live.get(name).generation;
  args.bucket.versions.set(`${name}:${gen}`, Buffer.from('{}'));
  await assert.rejects(prepareInitialData(args), /Integridade divergente/);
  assert.equal(await args.transaction.current(), null);
});

test('nao ignora outros arquivos invalidos', async t => {
  const args = await fixture(t, { unexpectedInvalid: true });
  await assert.rejects(prepareInitialData(args), /JSON invalido nao autorizado/);
  assert.equal(await args.transaction.current(), null);
});

test('nao substitui uma versao existente que nao seja a mesma preparacao', async t => {
  const args = await fixture(t);
  let lease = await args.transaction.acquire(60000);
  const ref = await args.transaction.stage(lease, { valor: 1 });
  lease = (await args.transaction.commit(lease, { existente: ref })).lease;
  await args.transaction.release(lease);
  await assert.rejects(prepareInitialData(args), /Documento ausente/);
  const current = await args.transaction.current();
  assert.equal(current.revision, 1);
  assert.deepEqual(await args.transaction.readDocument(current, 'existente'), { valor: 1 });
});
