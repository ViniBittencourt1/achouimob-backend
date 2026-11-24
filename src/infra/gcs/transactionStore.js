import { randomUUID } from 'node:crypto';
import { ConcurrentModificationError } from './jsonStorage.js';

export class LockUnavailableError extends Error {
  constructor(scope, lease) {
    super(`Operacao ${scope} em uso por ${lease.computerId} ate ${lease.expiresAt}.`);
    this.name = 'LockUnavailableError';
    this.lease = { computerId: lease.computerId, expiresAt: lease.expiresAt };
  }
}

export class LockLostError extends Error {
  constructor(scope, cause) {
    super(`Lock de ${scope} expirou ou foi alterado; a operacao nao pode confirmar alteracoes.`, { cause });
    this.name = 'LockLostError';
  }
}

function isReference(ref, prefix) {
  return ref && typeof ref.name === 'string' && ref.name.startsWith(prefix) &&
    /^[0-9a-f-]{36}\.json$/.test(ref.name.slice(prefix.length)) &&
    /^[1-9]\d*$/.test(String(ref.generation)) && Number.isSafeInteger(Number(ref.generation));
}

export class TransactionStore {
  constructor({ storage, scope, computerId, clock = () => Date.now() }) {
    if (!storage || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(scope || '') ||
        typeof computerId !== 'string' || !computerId.trim() || typeof clock !== 'function') {
      throw new Error('Informe storage, escopo valido e identificacao do computador.');
    }
    this.storage = storage;
    this.scope = scope;
    this.computerId = computerId.trim();
    this.clock = clock;
    this.prefix = `controles/transacoes/${scope}`;
    this.stateName = `${this.prefix}/estado.json`;
  }

  now() {
    const value = this.clock();
    if (!Number.isSafeInteger(value) || value < 0 || value > 8640000000000000) {
      throw new Error('Relogio invalido.');
    }
    return value;
  }

  async state() {
    let result;
    try {
      result = await this.storage.read(this.stateName);
    } catch (error) {
      if (Number(error?.code) !== 404) throw error;
      return { data: { version: 1, revision: 0, current: null, lease: null }, generation: '0' };
    }
    const state = result.data;
    if (!state || state.version !== 1 || !Number.isSafeInteger(state.revision) || state.revision < 0 ||
        (state.revision === 0 ? state.current !== null : !isReference(state.current, `${this.prefix}/versoes/`)) ||
        (state.lease !== null && (!state.lease || typeof state.lease.token !== 'string' ||
          !state.lease.token || typeof state.lease.computerId !== 'string' || !state.lease.computerId ||
          !Number.isSafeInteger(state.lease.startedAt) || !Number.isSafeInteger(state.lease.expiresAt) ||
          state.lease.expiresAt <= state.lease.startedAt))) {
      throw new Error(`Estado de concorrencia invalido: ${this.stateName}.`);
    }
    return result;
  }

  duration(durationMs) {
    if (!Number.isSafeInteger(durationMs) || durationMs < 1000 || durationMs > 86400000) {
      throw new Error('Validade do lock deve estar entre 1 segundo e 24 horas.');
    }
    return durationMs;
  }

  async acquire(durationMs) {
    const duration = this.duration(durationMs);
    const { data, generation } = await this.state();
    const now = this.now();
    if (data.lease && data.lease.expiresAt > now) {
      throw new LockUnavailableError(this.scope, data.lease);
    }
    const lease = {
      token: randomUUID(),
      computerId: this.computerId,
      startedAt: now,
      expiresAt: now + duration,
    };
    try {
      const saved = await this.storage.write(this.stateName, { ...data, lease }, { expectedGeneration: generation });
      return { ...lease, generation: saved.generation };
    } catch (error) {
      if (error instanceof ConcurrentModificationError) throw new LockLostError(this.scope, error);
      throw error;
    }
  }

  async requireLease(lease) {
    const state = await this.state();
    if (!lease || lease.computerId !== this.computerId || state.generation !== lease.generation ||
        !state.data.lease || state.data.lease.token !== lease.token ||
        state.data.lease.computerId !== this.computerId || state.data.lease.expiresAt <= this.now()) {
      throw new LockLostError(this.scope);
    }
    return state;
  }

  async updateWithLease(lease, update) {
    const state = await this.requireLease(lease);
    const next = update(state.data);
    try {
      const saved = await this.storage.write(this.stateName, next, { expectedGeneration: state.generation });
      return { state: next, generation: saved.generation };
    } catch (error) {
      if (error instanceof ConcurrentModificationError) throw new LockLostError(this.scope, error);
      throw error;
    }
  }

  async renew(lease, durationMs) {
    const duration = this.duration(durationMs);
    const result = await this.updateWithLease(lease, data => {
      const expiresAt = this.now() + duration;
      if (expiresAt <= data.lease.startedAt) throw new Error('Relogio recuou alem da validade do lock.');
      return { ...data, lease: { ...data.lease, expiresAt } };
    });
    return { ...result.state.lease, generation: result.generation };
  }

  async release(lease) {
    await this.updateWithLease(lease, data => ({ ...data, lease: null }));
  }

  async stage(lease, data) {
    await this.requireLease(lease);
    const name = `${this.prefix}/dados/${randomUUID()}.json`;
    const { generation } = await this.storage.write(name, data, { expectedGeneration: 0 });
    await this.storage.readVersion(name, generation);
    return { name, generation };
  }

  async commit(lease, documents) {
    if (!documents || typeof documents !== 'object' || Array.isArray(documents) || !Object.keys(documents).length) {
      throw new Error('Informe os documentos da versao.');
    }
    const entries = Object.entries(documents).map(([key, ref]) => [
      key, ref && { name: ref.name, generation: ref.generation },
    ]);
    for (const [key, ref] of entries) {
      if (!key.trim() || !isReference(ref, `${this.prefix}/dados/`)) {
        throw new Error('Referencia de documento invalida.');
      }
      await this.storage.readVersion(ref.name, ref.generation);
    }
    const state = await this.requireLease(lease);
    if (state.data.revision === Number.MAX_SAFE_INTEGER) throw new Error('Limite de revisoes atingido.');
    const manifest = {
      version: 1,
      revision: state.data.revision + 1,
      previous: state.data.current,
      computerId: this.computerId,
      createdAt: this.now(),
      documents: Object.fromEntries(entries),
    };
    const name = `${this.prefix}/versoes/${randomUUID()}.json`;
    const { generation } = await this.storage.write(name, manifest, { expectedGeneration: 0 });
    await this.storage.readVersion(name, generation);
    const updated = await this.updateWithLease(lease, data => ({
      ...data,
      revision: manifest.revision,
      current: { name, generation },
    }));
    return { lease: { ...updated.state.lease, generation: updated.generation }, revision: manifest.revision };
  }

  async current() {
    const { data } = await this.state();
    if (!data.current) return null;
    const result = await this.storage.readVersion(data.current.name, data.current.generation);
    if (!result.data || result.data.version !== 1 || result.data.revision !== data.revision ||
        !result.data.documents || typeof result.data.documents !== 'object' || Array.isArray(result.data.documents)) {
      throw new Error('Manifesto da versao atual invalido.');
    }
    for (const ref of Object.values(result.data.documents)) {
      if (!isReference(ref, `${this.prefix}/dados/`)) throw new Error('Referencia no manifesto invalida.');
    }
    return result.data;
  }

  async readDocument(manifest, key) {
    const ref = Object.hasOwn(manifest?.documents || {}, key) && manifest.documents[key];
    if (!isReference(ref, `${this.prefix}/dados/`)) throw new Error('Documento ausente ou referencia invalida.');
    return (await this.storage.readVersion(ref.name, ref.generation)).data;
  }
}
