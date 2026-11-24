import { readGeneration, saveOrVerify, sha256 } from './verifiedBlob.js';

const RECEIPT = '_migracao/backup-inicial.json';
const ALLOWED_INVALID = new Set(['_03database/jfora/jfClientt.json']);
const LEASE_MS = 15 * 60 * 1000;

function validPath(value) {
  return typeof value === 'string' && value.length > 0 && !value.startsWith('/') &&
    !value.includes('\\') && !value.split('/').some(part => !part || part === '.' || part === '..');
}

function objectId(backupId, name, digest) {
  const hex = sha256(Buffer.from(`${backupId}\0${name}\0${digest}`)).slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function parseJson(bytes, name) {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    if (!(error instanceof SyntaxError) && !(error instanceof TypeError)) throw error;
    throw new Error(`JSON invalido: ${name}.`, { cause: error });
  }
}

async function loadBackup(bucket, backupId) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(backupId || '')) throw new Error('Identificador de backup invalido.');
  const prefix = `backups/importacao-inicial/${backupId}/`;
  const [metadata] = await bucket.file(`${prefix}concluido.json`).getMetadata();
  const completionBytes = await readGeneration(bucket, `${prefix}concluido.json`, metadata.generation);
  const completion = parseJson(completionBytes, `${prefix}concluido.json`);
  if (completion.version !== 1 || completion.backupId !== backupId || !Array.isArray(completion.objects) ||
      typeof completion.inventorySha256 !== 'string') throw new Error('Manifesto de conclusao invalido.');
  const inventoryBytes = await readGeneration(bucket, `${prefix}inventario.json`, completion.inventoryGeneration);
  if (sha256(inventoryBytes) !== completion.inventorySha256) throw new Error('Hash do inventario nao confere.');
  const inventory = parseJson(inventoryBytes, `${prefix}inventario.json`);
  if (inventory.version !== 1 || inventory.backupId !== backupId || !Array.isArray(inventory.items) ||
      completion.files !== inventory.items.length || completion.objects.length !== inventory.items.length) {
    throw new Error('Inventario e conclusao do backup nao conferem.');
  }
  const refs = new Map();
  for (const ref of completion.objects) {
    if (!ref || typeof ref.name !== 'string' || !ref.name.startsWith(prefix) ||
        !/^[1-9]\d*$/.test(String(ref.generation)) || !Number.isSafeInteger(Number(ref.generation)) ||
        refs.has(ref.name)) throw new Error('Referencias invalidas no backup.');
    refs.set(ref.name, String(ref.generation));
  }
  const seen = new Set();
  const originals = [];
  for (const item of inventory.items) {
    if (!item || !['original', 'copia'].includes(item.origin) || !validPath(item.path) ||
        !Number.isSafeInteger(item.size) || item.size < 0 || !/^[0-9a-f]{64}$/.test(item.sha256 || '') ||
        typeof item.validJson !== 'boolean') throw new Error('Entrada invalida no inventario.');
    const name = `${prefix}${item.origin}/${item.path}`;
    if (seen.has(name) || !refs.has(name)) throw new Error('Objeto ausente ou duplicado no inventario do backup.');
    seen.add(name);
    if (item.origin === 'original') originals.push({ ...item, name, generation: refs.get(name) });
  }
  if (completion.originalFiles !== originals.length) throw new Error('Contagem de originais nao confere.');
  const invalid = originals.filter(item => !item.validJson);
  if (invalid.some(item => !ALLOWED_INVALID.has(item.path))) throw new Error('O backup contem JSON invalido nao autorizado para exclusao.');
  if (originals.some(item => item.path === RECEIPT)) throw new Error('Caminho reservado para o comprovante de migracao.');
  return { completion, completionGeneration: String(metadata.generation), originals, invalid };
}

async function verifyBytes(bucket, ref, item) {
  const bytes = await readGeneration(bucket, ref.name, ref.generation);
  if (bytes.length !== item.size || sha256(bytes) !== item.sha256) {
    throw new Error(`Integridade divergente: ${ref.name}.`);
  }
  return bytes;
}

function verifyJsonValidity(bytes, item) {
  try {
    parseJson(bytes, item.path);
  } catch (error) {
    if (item.validJson || !error.message.startsWith('JSON invalido:')) throw error;
    return;
  }
  if (!item.validJson) throw new Error(`Arquivo indicado como invalido agora e valido: ${item.path}.`);
}

async function stageBytes(bucket, transaction, backupId, name, bytes) {
  const digest = sha256(bytes);
  const objectName = `${transaction.prefix}/dados/${objectId(backupId, name, digest)}.json`;
  const generation = await saveOrVerify(bucket, objectName, bytes, 'application/json; charset=utf-8');
  return { name: objectName, generation };
}

export async function prepareInitialData({ bucket, transaction, backupId, progress = () => {} }) {
  if (!bucket || !transaction || typeof progress !== 'function') throw new Error('Informe bucket, transacao e progresso validos.');
  const backup = await loadBackup(bucket, backupId);
  const receipt = {
    version: 1,
    status: 'preparacao-nao-ativa',
    backupId,
    completionGeneration: backup.completionGeneration,
    inventoryGeneration: String(backup.completion.inventoryGeneration),
    inventorySha256: backup.completion.inventorySha256,
    files: backup.originals.map(({ path, size, sha256: digest, validJson, name, generation }) => ({
      path, size, sha256: digest, validJson, source: { name, generation },
    })),
  };
  const receiptBytes = Buffer.from(JSON.stringify(receipt));
  let lease = await transaction.acquire(LEASE_MS);
  let failure;
  let result;
  try {
    const existing = await transaction.current();
    if (existing) {
      const currentReceipt = await transaction.readDocument(existing, RECEIPT);
      if (JSON.stringify(currentReceipt) !== JSON.stringify(receipt)) {
        throw new Error('Ja existe outra versao no escopo; nenhuma versao foi sobrescrita.');
      }
    }
    const documents = {};
    for (let i = 0; i < backup.originals.length; i++) {
      if (i > 0 && i % 50 === 0) {
        lease = await transaction.renew(lease, LEASE_MS);
        progress(i, backup.originals.length);
      }
      const item = backup.originals[i];
      const bytes = await verifyBytes(bucket, item, item);
      verifyJsonValidity(bytes, item);
      if (!item.validJson) continue;
      if (existing) {
        const ref = existing.documents[item.path];
        if (!ref) throw new Error(`Documento ausente na versao existente: ${item.path}.`);
        await verifyBytes(bucket, ref, item);
        documents[item.path] = ref;
      } else {
        documents[item.path] = await stageBytes(bucket, transaction, backupId, item.path, bytes);
      }
    }
    if (existing) {
      if (Object.keys(existing.documents).length !== Object.keys(documents).length + 1) {
        throw new Error('Quantidade de documentos da versao existente nao confere.');
      }
      result = { revision: existing.revision, reused: true };
    } else {
      documents[RECEIPT] = await stageBytes(bucket, transaction, backupId, RECEIPT, receiptBytes);
      lease = await transaction.renew(lease, LEASE_MS);
      const committed = await transaction.commit(lease, documents);
      lease = committed.lease;
      const current = await transaction.current();
      if (!current || current.revision !== committed.revision ||
          JSON.stringify(current.documents) !== JSON.stringify(documents) ||
          JSON.stringify(await transaction.readDocument(current, RECEIPT)) !== JSON.stringify(receipt)) {
        throw new Error('Validacao da versao confirmada falhou; nao reexecute sem investigar.');
      }
      result = { revision: committed.revision, reused: false };
    }
    result = {
      ...result,
      sourceFiles: backup.originals.length,
      validFiles: backup.originals.length - backup.invalid.length,
      invalidFiles: backup.invalid.map(item => item.path),
      status: receipt.status,
    };
  } catch (error) {
    failure = error;
  }
  try {
    await transaction.release(lease);
  } catch (error) {
    if (failure) throw new AggregateError([failure, error], 'Preparacao falhou e o lock nao foi liberado; verifique o estado.');
    throw new Error('Preparacao confirmada, mas o lock nao foi liberado; verifique o estado.', { cause: error });
  }
  if (failure) throw failure;
  return result;
}
