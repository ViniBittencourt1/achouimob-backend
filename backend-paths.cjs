const fs = require('node:fs');
const path = require('node:path');

const backendRoot = fs.realpathSync(typeof process.pkg === 'undefined' ? __dirname : path.dirname(process.execPath));
const markerName = '.achouimob-backend-isolado';
const markerContents = 'achouimob-backend-isolado-v1';

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function localPath(root, ...parts) {
  const resolvedRoot = fs.realpathSync(root);
  const target = path.resolve(resolvedRoot, ...parts);
  if (!isInside(resolvedRoot, target)) throw new Error('Caminho fora do backend isolado.');
  let existing = target;
  while (true) {
    try {
      fs.lstatSync(existing);
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = path.dirname(existing);
      if (parent === existing) throw error;
      existing = parent;
    }
  }
  if (!isInside(resolvedRoot, fs.realpathSync(existing))) {
    throw new Error('Caminho redirecionado para fora do backend isolado.');
  }
  return target;
}

function launcherBackend({ sourceDir, executablePath, packaged, configured }) {
  const root = fs.realpathSync(packaged ? path.dirname(executablePath) : sourceDir);
  if (configured && fs.realpathSync(configured) !== root) {
    throw new Error('RASPAGEM_IMOVEIS_BACKEND deve apontar para esta copia isolada.');
  }
  const marker = localPath(root, markerName);
  if (fs.readFileSync(marker, 'utf8').trim() !== markerContents) {
    throw new Error('Marcador do backend isolado invalido.');
  }
  if (!fs.existsSync(localPath(root, 'package.json')) || !fs.existsSync(localPath(root, 'render-daily.js'))) {
    throw new Error('Backend isolado incompleto.');
  }
  return root;
}

const backendEnvPath = localPath(backendRoot, '.env');
for (const name of ['crawler', '_03database', 'logs', 'credentials']) localPath(backendRoot, name);

module.exports = { backendRoot, backendEnvPath, localPath, launcherBackend };
