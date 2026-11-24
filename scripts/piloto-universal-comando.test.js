import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const launcher = fileURLToPath(new URL('./piloto-universal-comando.js', import.meta.url));

function withLauncher(run) {
  const dir = fs.mkdtempSync(path.join(root, '.teste-piloto-comando-'));
  try {
    const scripts = path.join(dir, 'scripts');
    fs.mkdirSync(scripts);
    fs.copyFileSync(launcher, path.join(scripts, 'piloto-universal-comando.js'));
    fs.writeFileSync(path.join(scripts, 'piloto-universal-vendas-gcs.js'), `
      console.log(JSON.stringify({
        bucket: process.env.GCS_BUCKET,
        scope: process.env.GCS_OPERATION_SCOPE,
        report: process.env.GCS_REPORTS_SPREADSHEET_ID,
        argument: process.argv[2],
      }));
    `);
    run(dir, path.join(scripts, 'piloto-universal-comando.js'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('comando usa configuracao local, bloqueia Sheets e encaminha UUID', () => {
  withLauncher((dir, entry) => {
    fs.writeFileSync(path.join(dir, '.env.piloto-universal'), [
      'GCS_BUCKET=bucket-local',
      'GCS_OPERATION_SCOPE=piloto-jfuniversal-local',
      'ACHOUIMOB_COMPUTER_ID=pc-local',
      'ACHOUIMOB_ACTOR=operador',
    ].join('\n'));
    const result = spawnSync(process.execPath, [entry, 'uuid-teste'], {
      encoding: 'utf8',
      env: { ...process.env, GCS_BUCKET: 'bucket-externo', GCS_REPORTS_SPREADSHEET_ID: 'planilha-externa' },
    });
    assert.equal(result.status, 0, result.stderr);
    const actual = JSON.parse(result.stdout.trim().split('\n').at(-1));
    assert.deepEqual(actual, {
      bucket: 'bucket-local', scope: 'piloto-jfuniversal-local', report: '', argument: 'uuid-teste',
    });
  });
});

test('comando nao inicia quando falta configuracao local', () => {
  withLauncher((dir, entry) => {
    const result = spawnSync(process.execPath, [entry], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Nao foi possivel carregar/);
    assert.doesNotMatch(result.stdout, /Piloto GCS:/);
  });
});
