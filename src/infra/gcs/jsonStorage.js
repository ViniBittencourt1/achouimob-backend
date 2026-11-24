import { Storage } from '@google-cloud/storage';

export class ConcurrentModificationError extends Error {
  constructor(name, cause) {
    super(`O objeto ${name} foi alterado por outro processo. Releia antes de gravar.`, { cause });
    this.name = 'ConcurrentModificationError';
  }
}

function validateObjectName(name) {
  if (typeof name !== 'string' || !name || name.startsWith('/') || name.includes('\\') ||
      name.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('Nome de objeto GCS invalido.');
  }
}

function generationNumber(generation) {
  const text = String(generation);
  const value = Number(text);
  if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(value)) {
    throw new Error('Geracao GCS invalida ou fora do intervalo seguro.');
  }
  return value;
}

export class JsonStorage {
  constructor({ bucketName, bucket } = {}) {
    if (bucket) {
      this.bucket = bucket;
    } else {
      if (typeof bucketName !== 'string' || !bucketName.trim()) {
        throw new Error('Informe o nome do bucket GCS.');
      }
      this.bucket = new Storage().bucket(bucketName.trim());
    }
  }

  async read(name) {
    validateObjectName(name);
    const [metadata] = await this.bucket.file(name).getMetadata();
    return this.readVersion(name, metadata.generation);
  }

  async readVersion(name, generation) {
    validateObjectName(name);
    const number = generationNumber(generation);
    const [contents] = await this.bucket.file(name, { generation: number }).download({ validation: 'crc32c' });
    let data;
    try {
      data = JSON.parse(contents.toString('utf8'));
    } catch (error) {
      throw new Error(`JSON invalido no objeto ${name}.`, { cause: error });
    }
    return { data, generation: String(number) };
  }

  async write(name, data, { expectedGeneration } = {}) {
    validateObjectName(name);
    if (expectedGeneration === undefined || expectedGeneration === null) {
      throw new Error('Informe a geracao esperada; use 0 somente para criar um objeto novo.');
    }
    const generation = expectedGeneration === 0 || expectedGeneration === '0'
      ? 0
      : generationNumber(expectedGeneration);
    const json = JSON.stringify(data);
    if (json === undefined) throw new Error('Valor nao pode ser serializado como JSON.');
    const file = this.bucket.file(name);
    try {
      await file.save(Buffer.from(json, 'utf8'), {
        resumable: false,
        validation: 'crc32c',
        contentType: 'application/json; charset=utf-8',
        preconditionOpts: { ifGenerationMatch: generation },
      });
    } catch (error) {
      if (Number(error?.code) === 412) throw new ConcurrentModificationError(name, error);
      throw error;
    }
    if (!file.metadata?.generation) {
      throw new Error(`Gravacao de ${name} confirmada, mas a geracao nao foi retornada; releia antes de tentar novamente.`);
    }
    generationNumber(file.metadata.generation);
    return { generation: String(file.metadata.generation) };
  }
}
