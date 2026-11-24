import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createInitialBackup } from './initialBackup.js';

function fakeBucket() {
  const objects = new Map();
  let generation = 0;
  let failName;
  return {
    objects,
    failOnce(name) { failName = name; },
    file(name, options = {}) {
      return {
        async save(bytes, settings) {
          assert.equal(settings.preconditionOpts.ifGenerationMatch, 0);
          if (failName && name.endsWith(failName)) {
            failName = undefined;
            throw new Error('falha simulada');
          }
          if (objects.has(name)) throw Object.assign(new Error('exists'), { code: 412 });
          objects.set(name, { generation: ++generation, bytes: Buffer.from(bytes) });
        },
        async getMetadata() {
          return [{ generation: String(objects.get(name).generation) }];
        },
        async download() {
          const item = objects.get(name);
          assert.equal(options.generation, item.generation);
          return [item.bytes];
        },
      };
    },
  };
}

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'backup-inicial-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const primaryRoot = path.join(root, 'original');
  const copyRoot = path.join(root, 'copia');
  const logsParent = path.join(root, 'externo');
  for (const dir of [primaryRoot, copyRoot]) {
    await mkdir(path.join(dir, 'crawler'), { recursive: true });
    await mkdir(path.join(dir, '_03database'), { recursive: true });
    await mkdir(path.join(dir, '_01extractor', 'crawlers', 'jfora', '_1Jf'), { recursive: true });
    await writeFile(path.join(dir, 'crawler', 'imovel.json'), '{"preco":1}\n');
    await writeFile(path.join(dir, '_03database', 'vazio.json'), '');
    await writeFile(path.join(dir, '_01extractor', 'crawlers', 'jfora', '_1Jf', 'extracoes.json'), '{}');
    await writeFile(path.join(dir, '_01extractor', 'crawlers', 'jfora', '_1Jf', 'site-scheduler-config.json'), '{}');
  }
  await writeFile(path.join(copyRoot, 'crawler', 'imovel.json'), '{"preco":2}\n');
  await writeFile(path.join(copyRoot, 'crawler', 'exclusivo.json'), '[]');
  await mkdir(path.join(logsParent, 'logs'), { recursive: true });
  await writeFile(path.join(logsParent, 'logs', 'historico.json'), '[1]');
  return { primaryRoot, copyRoot, logsParent, backupId: 'teste', computerId: 'pc-1', bucket: fakeBucket() };
}

test('preserva bytes originais e versoes divergentes e sinaliza JSON invalido', async t => {
  const args = await fixture(t);
  const result = await createInitialBackup(args);
  assert.equal(result.originalFiles, 5);
  assert.equal(result.copyDifferences, 2);
  assert.deepEqual(result.invalidJson, [{ origin: 'original', path: '_03database/vazio.json' }]);
  const prefix = 'backups/importacao-inicial/teste';
  assert.deepEqual(args.bucket.objects.get(`${prefix}/original/crawler/imovel.json`).bytes,
    await readFile(path.join(args.primaryRoot, 'crawler', 'imovel.json')));
  assert.equal(args.bucket.objects.get(`${prefix}/copia/crawler/imovel.json`).bytes.toString(), '{"preco":2}\n');
  assert.equal(result.objects.length, 7);
  assert.ok(args.bucket.objects.has(`${prefix}/concluido.json`));
  assert.deepEqual(await createInitialBackup(args), result);
});

test('retoma falha sem sobrescrever e recusa alteracao local', async t => {
  const args = await fixture(t);
  const prefix = 'backups/importacao-inicial/teste';
  args.bucket.failOnce('original/crawler/imovel.json');
  await assert.rejects(createInitialBackup(args), /falha simulada/);
  assert.equal(args.bucket.objects.has(`${prefix}/concluido.json`), false);
  await writeFile(path.join(args.primaryRoot, 'crawler', 'imovel.json'), '{"preco":3}');
  await assert.rejects(createInitialBackup(args), /Conteudo divergente no GCS/);
  assert.equal(args.bucket.objects.has(`${prefix}/concluido.json`), false);
  await writeFile(path.join(args.primaryRoot, 'crawler', 'imovel.json'), '{"preco":1}\n');
  await createInitialBackup(args);
  assert.ok(args.bucket.objects.has(`${prefix}/concluido.json`));
});

test('interrompe se um objeto existente nao corresponder ao inventario', async t => {
  const args = await fixture(t);
  const name = 'backups/importacao-inicial/teste/original/crawler/imovel.json';
  args.bucket.objects.set(name, { generation: 900, bytes: Buffer.from('incorreto') });
  await assert.rejects(createInitialBackup(args), /Conteudo divergente no GCS/);
  assert.equal(args.bucket.objects.has('backups/importacao-inicial/teste/concluido.json'), false);
});

test('nao conclui se a origem mudar apos a copia de um arquivo', async t => {
  const args = await fixture(t);
  const originalFile = args.bucket.file.bind(args.bucket);
  args.bucket.file = (name, options) => {
    const file = originalFile(name, options);
    if (name.endsWith('/original/logs/historico.json')) {
      const save = file.save;
      file.save = async (...params) => {
        await save(...params);
        await writeFile(path.join(args.primaryRoot, 'crawler', 'imovel.json'), '{"preco":9}');
      };
    }
    return file;
  };
  await assert.rejects(createInitialBackup(args), /arquivos locais mudaram/i);
  assert.equal(args.bucket.objects.has('backups/importacao-inicial/teste/concluido.json'), false);
});
