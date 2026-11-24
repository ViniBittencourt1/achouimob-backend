import { createHash } from 'node:crypto';

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function readGeneration(bucket, name, generation) {
  const number = Number(generation);
  if (!/^[1-9]\d*$/.test(String(generation)) || !Number.isSafeInteger(number)) {
    throw new Error(`Geracao invalida no objeto ${name}.`);
  }
  const [bytes] = await bucket.file(name, { generation: number }).download({ validation: 'crc32c' });
  return bytes;
}

export async function saveOrVerify(bucket, name, bytes, contentType = 'application/octet-stream') {
  const file = bucket.file(name);
  try {
    await file.save(bytes, {
      resumable: false,
      validation: 'crc32c',
      contentType,
      preconditionOpts: { ifGenerationMatch: 0 },
    });
  } catch (error) {
    if (Number(error?.code) !== 412) throw error;
  }
  const [metadata] = await file.getMetadata();
  const stored = await readGeneration(bucket, name, metadata.generation);
  if (stored.length !== bytes.length || sha256(stored) !== sha256(bytes)) {
    throw new Error(`Conteudo divergente no GCS: ${name}. Nenhum objeto foi sobrescrito.`);
  }
  return String(metadata.generation);
}
