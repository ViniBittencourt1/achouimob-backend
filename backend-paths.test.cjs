const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { backendRoot, localPath, launcherBackend } = require('./backend-paths.cjs');
const { publicationEnvironment } = require('./publication-config.cjs');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'backend-isolado-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'copia');
  const original = path.join(directory, 'backend');
  fs.mkdirSync(root);
  fs.mkdirSync(original);
  fs.writeFileSync(path.join(root, '.achouimob-backend-isolado'), 'achouimob-backend-isolado-v1\n');
  fs.writeFileSync(path.join(root, 'package.json'), '{}');
  fs.writeFileSync(path.join(root, 'render-daily.js'), '');
  return { directory, root, original };
}

test('caminhos de logs ficam dentro da copia e recusam escapes e junctions', t => {
  const { root, original } = fixture(t);
  assert.equal(localPath(root, 'logs', 'relatorio.json'), path.join(root, 'logs', 'relatorio.json'));
  assert.throws(() => localPath(root, '..', 'backend', 'arquivo.json'), /fora do backend/);
  fs.symlinkSync(original, path.join(root, 'logs'), 'junction');
  assert.throws(() => localPath(root, 'logs', 'relatorio.json'), /redirecionado/);
});

test('launcher nao aceita backend externo nem executavel sem marcador', t => {
  const { root, original } = fixture(t);
  const options = { sourceDir: root, executablePath: path.join(root, 'crawler.exe'), packaged: false };
  assert.equal(launcherBackend(options), fs.realpathSync(root));
  assert.throws(() => launcherBackend({ ...options, configured: original }), /copia isolada/);
  assert.throws(() => launcherBackend({ ...options, packaged: true, executablePath: path.join(original, 'crawler.exe') }));
});

test('raiz dos crawlers independe do diretorio inicial e configuracao ignora env do pai', t => {
  const { directory, root, original } = fixture(t);
  const result = spawnSync(process.execPath, ['-e',
    `process.stdout.write(require(${JSON.stringify(path.join(backendRoot, 'backend-paths.cjs'))}).backendRoot)`,
  ], { cwd: original, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, backendRoot);
  fs.writeFileSync(path.join(directory, '.env'), 'TESTE_ISOLAMENTO=externo\n');
  assert.equal(publicationEnvironment(root, {}).TESTE_ISOLAMENTO, undefined);
  fs.writeFileSync(path.join(root, '.env'), 'TESTE_ISOLAMENTO=local\n');
  assert.equal(publicationEnvironment(root, {}).TESTE_ISOLAMENTO, 'local');
});

test('crawler usa a copia mesmo com diretorio inicial apontando para outro backend', async t => {
  const { root, original } = fixture(t);
  const source = fs.readFileSync(path.join(backendRoot, '_01extractor', 'crawlers', 'jfora', 'alicerce', 'extractor-00-rotaExterna.js'), 'utf8');
  const body = source.slice(source.indexOf('async function raspagemPorLinks()'), source.indexOf('// Executa a raspagem automaticamente'));
  let saved;
  const run = vm.runInNewContext(`${body}\nraspagemPorLinks`, {
    ISOLATED_BACKEND_ROOT: root,
    process: { cwd: () => original },
    puppeteer: { launch: async () => ({ close: async () => {} }) },
    extractAlicerceData: async () => [{ preco: 10 }],
    linksBusca: [],
    console: { log() {} },
    path,
    fs: { existsSync: () => true, writeFileSync: (file, data) => { saved = { file, data }; } },
  });
  await run();
  assert.equal(saved.file, path.join(root, 'crawler', 'jfAlicerce.json'));
  assert.equal(fs.existsSync(path.join(original, 'crawler')), false);
});
