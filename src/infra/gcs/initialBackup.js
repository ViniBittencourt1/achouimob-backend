import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { saveOrVerify, sha256 } from './verifiedBlob.js';

const CONTROL_DIR = '_01extractor/crawlers/jfora/_1Jf';
const CONTROL_FILES = ['extracoes.json', 'site-scheduler-config.json'];

async function listJson(root, relative) {
  const entries = await readdir(path.join(root, ...relative.split('/')), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const name = `${relative}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`Link simbolico nao permitido: ${name}`);
    if (entry.isDirectory()) files.push(...await listJson(root, name));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) files.push(name);
  }
  return files;
}

async function localFiles(root) {
  const files = [
    ...await listJson(root, 'crawler'),
    ...await listJson(root, '_03database'),
    ...CONTROL_FILES.map(name => `${CONTROL_DIR}/${name}`),
  ];
  return files.sort();
}

function localPath(root, relative) {
  return path.join(root, ...relative.split('/'));
}

async function describe(root, relative, origin) {
  const bytes = await readFile(localPath(root, relative));
  let validJson = true;
  try {
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    if (!(error instanceof SyntaxError) && !(error instanceof TypeError)) throw error;
    validJson = false;
  }
  return { origin, path: relative, size: bytes.length, sha256: sha256(bytes), validJson };
}

async function inventory(primaryRoot, copyRoot, logsRoot) {
  const primaryFiles = await localFiles(primaryRoot);
  const copyFiles = await localFiles(copyRoot);
  const primary = [];
  for (const name of primaryFiles) primary.push(await describe(primaryRoot, name, 'original'));
  const primaryByName = new Map(primary.map(item => [item.path, item]));
  const differences = [];
  for (const name of copyFiles) {
    const item = await describe(copyRoot, name, 'copia');
    const original = primaryByName.get(name);
    if (!original || original.sha256 !== item.sha256) differences.push(item);
  }
  const logs = [];
  const logNames = await listJson(logsRoot, 'logs');
  for (const name of logNames.sort()) logs.push(await describe(logsRoot, name, 'original'));
  return [...primary, ...logs, ...differences];
}

/**
 * Preserves an immutable inventory and verifies every original byte in GCS.
 * The sources must remain paused for the entire operation.
 */
export async function createInitialBackup({ bucket, backupId, computerId, primaryRoot, copyRoot, logsParent }) {
  if (!bucket || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(backupId || '') ||
      typeof computerId !== 'string' || !computerId.trim()) {
    throw new Error('Informe bucket, backupId valido e identificacao do computador.');
  }
  const prefix = `backups/importacao-inicial/${backupId}`;
  const items = await inventory(primaryRoot, copyRoot, logsParent);
  const plan = Buffer.from(JSON.stringify({ version: 1, backupId, computerId, items }, null, 2));
  const inventoryGeneration = await saveOrVerify(bucket, `${prefix}/inventario.json`, plan);

  const objects = [];
  for (const item of items) {
    const root = item.origin === 'copia' ? copyRoot : item.path.startsWith('logs/') ? logsParent : primaryRoot;
    const bytes = await readFile(localPath(root, item.path));
    if (bytes.length !== item.size || sha256(bytes) !== item.sha256) {
      throw new Error(`Arquivo mudou durante o backup: ${item.origin}/${item.path}.`);
    }
    const name = `${prefix}/${item.origin}/${item.path}`;
    const generation = await saveOrVerify(bucket, name, bytes);
    objects.push({ name, generation });
  }

  const after = await inventory(primaryRoot, copyRoot, logsParent);
  if (JSON.stringify(items) !== JSON.stringify(after)) {
    throw new Error('Os arquivos locais mudaram durante o backup. Conclusao nao registrada.');
  }
  const result = {
    version: 1,
    backupId,
    computerId,
    inventorySha256: sha256(plan),
    inventoryGeneration,
    objects,
    files: items.length,
    originalFiles: items.filter(item => item.origin === 'original').length,
    copyDifferences: items.filter(item => item.origin === 'copia').length,
    invalidJson: items.filter(item => !item.validJson).map(({ origin, path: name }) => ({ origin, path: name })),
  };
  await saveOrVerify(bucket, `${prefix}/concluido.json`, Buffer.from(JSON.stringify(result, null, 2)));
  return result;
}
