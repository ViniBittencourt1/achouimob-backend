const AUDIT_PREFIX = 'controles/operacoes/';
const REPORT_PREFIX = 'controles/relatorios/';
const LEASE_MS = 15 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class StaleSnapshotError extends Error {
  constructor() {
    super('A base mudou durante a operacao; releia os dados antes de tentar novamente.');
    this.name = 'StaleSnapshotError';
  }
}

function validKey(key) {
  return typeof key === 'string' && key.length > 0 && !key.startsWith('/') && !key.includes('\\') &&
    !key.split('/').some(part => !part || ['.', '..', '__proto__', 'prototype', 'constructor'].includes(part));
}

function copyJson(value, label) {
  const ancestors = new Set();
  function validate(item) {
    if (item === null || typeof item === 'string' || typeof item === 'boolean' ||
        (typeof item === 'number' && Number.isFinite(item))) return;
    if (typeof item !== 'object' || ancestors.has(item)) throw new Error('Valor nao representavel em JSON.');
    const array = Array.isArray(item);
    if ((!array && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) ||
        Object.getOwnPropertySymbols(item).length ||
        (array && (Object.keys(item).length !== item.length ||
          Object.keys(item).some((key, index) => key !== String(index)))) ||
        Object.entries(Object.getOwnPropertyDescriptors(item)).some(([key, descriptor]) =>
          !(array && key === 'length') && (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')))) {
      throw new Error('Valor nao representavel em JSON.');
    }
    ancestors.add(item);
    for (const child of Object.values(item)) validate(child);
    ancestors.delete(item);
  }
  try {
    validate(value);
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    throw new Error(`${label} nao e serializavel como JSON.`, { cause: error });
  }
}

export class OperationalStore {
  constructor({ transaction }) {
    if (!transaction) throw new Error('Informe o controle transacional GCS.');
    this.transaction = transaction;
  }

  async read(keys) {
    if (!Array.isArray(keys) || !keys.length || keys.some(key => !validKey(key)) ||
        new Set(keys).size !== keys.length) throw new Error('Informe caminhos de documentos validos e distintos.');
    const manifest = await this.transaction.current();
    if (!manifest) throw new Error('Base operacional ainda nao inicializada.');
    const values = {};
    for (const key of keys) {
      if (!Object.hasOwn(manifest.documents, key)) throw new Error(`Documento obrigatorio ausente: ${key}.`);
      Object.defineProperty(values, key, {
        value: await this.transaction.readDocument(manifest, key), enumerable: true, writable: true,
      });
    }
    return { scope: this.transaction.scope, revision: manifest.revision, values };
  }

  async commit(snapshot, { operationId, type, actor, changes, report }) {
    if (this.transaction.scope === 'base-preparacao-inicial') {
      throw new Error('A base de preparacao nao esta ativa e nao pode receber operacoes.');
    }
    if (!snapshot || snapshot.scope !== this.transaction.scope ||
        !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 1 ||
        typeof operationId !== 'string' ||
        !UUID.test(operationId) ||
        !['raspagem', 'correcao', 'confirmacao'].includes(type) ||
        typeof actor !== 'string' || !actor.trim() || actor.length > 200 ||
        !changes || typeof changes !== 'object' || Array.isArray(changes) ||
        !report || typeof report !== 'object' || Array.isArray(report)) {
      throw new Error('Operacao, revisao, alteracoes ou relatorio invalidos.');
    }
    const entries = Object.entries(changes);
    if (!entries.length || entries.some(([key]) => !validKey(key) ||
        key.startsWith(AUDIT_PREFIX) || key.startsWith(REPORT_PREFIX))) {
      throw new Error('Caminhos das alteracoes invalidos ou reservados.');
    }
    const preparedChanges = entries.map(([key, value]) => [key, copyJson(value, `Documento ${key}`)]);
    const reportData = copyJson(report, 'Relatorio');
    let lease = await this.transaction.acquire(LEASE_MS);
    let failure;
    let result;
    try {
      const current = await this.transaction.current();
      if (!current || current.revision !== snapshot.revision) throw new StaleSnapshotError();
      const auditKey = `${AUDIT_PREFIX}${operationId}.json`;
      const reportKey = `${REPORT_PREFIX}${operationId}.json`;
      if (Object.hasOwn(current.documents, auditKey) || Object.hasOwn(current.documents, reportKey)) {
        throw new Error('Operacao ja registrada; consulte o estado antes de repetir.');
      }
      const now = this.transaction.now();
      const audit = {
        version: 1, operationId, type, actor: actor.trim(), computerId: this.transaction.computerId,
        timestamp: new Date(now).toISOString(), previousRevision: current.revision,
        revision: current.revision + 1, changedDocuments: preparedChanges.map(([key]) => key), reportKey,
      };
      const pendingReport = {
        version: 1, operationId, type, status: 'pendente', createdAt: audit.timestamp, data: reportData,
      };
      const documents = { ...current.documents };
      for (const [key, data] of preparedChanges) {
        documents[key] = await this.transaction.stage(lease, data);
      }
      documents[auditKey] = await this.transaction.stage(lease, audit);
      documents[reportKey] = await this.transaction.stage(lease, pendingReport);
      const committed = await this.transaction.commit(lease, documents);
      lease = committed.lease;
      const verified = await this.transaction.current();
      if (!verified || verified.revision !== committed.revision ||
          JSON.stringify(verified.documents) !== JSON.stringify(documents) ||
          JSON.stringify(await this.transaction.readDocument(verified, auditKey)) !== JSON.stringify(audit) ||
          JSON.stringify(await this.transaction.readDocument(verified, reportKey)) !== JSON.stringify(pendingReport)) {
        throw new Error('Confirmacao nao foi verificada; consulte o estado antes de repetir.');
      }
      for (const [key, data] of preparedChanges) {
        if (JSON.stringify(await this.transaction.readDocument(verified, key)) !== JSON.stringify(data)) {
          throw new Error(`Documento ${key} nao foi verificado; consulte o estado antes de repetir.`);
        }
      }
      result = { operationId, revision: committed.revision, auditKey, reportKey, reportStatus: 'pendente' };
    } catch (error) {
      failure = error;
    }
    try {
      await this.transaction.release(lease);
    } catch (error) {
      if (failure) throw new AggregateError([failure, error], 'Operacao falhou e lock nao foi liberado; consulte o estado.');
      throw new Error('Operacao confirmada, mas lock nao foi liberado; consulte o estado.', { cause: error });
    }
    if (failure) throw failure;
    return result;
  }

  async updateReport(operationId, spreadsheetId, actor, delivered = false) {
    if (this.transaction.scope === 'base-preparacao-inicial' || typeof operationId !== 'string' || !UUID.test(operationId) ||
        typeof spreadsheetId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(spreadsheetId) ||
        typeof actor !== 'string' || !actor.trim() || actor.length > 200 || typeof delivered !== 'boolean') {
      throw new Error('Identificacao de relatorio, planilha ou operador invalida.');
    }
    let lease = await this.transaction.acquire(LEASE_MS);
    let failure;
    let result;
    try {
      const current = await this.transaction.current();
      const reportKey = `${REPORT_PREFIX}${operationId}.json`;
      const auditKey = `${AUDIT_PREFIX}${operationId}.json`;
      if (!current || !Object.hasOwn(current.documents, reportKey) || !Object.hasOwn(current.documents, auditKey)) {
        throw new Error('Relatorio ou auditoria ausente.');
      }
      const report = await this.transaction.readDocument(current, reportKey);
      const audit = await this.transaction.readDocument(current, auditKey);
      if (!report || report.version !== 1 || report.operationId !== operationId ||
          !['pendente', 'entregue'].includes(report.status) || audit?.operationId !== operationId ||
          !Number.isSafeInteger(audit.revision) || audit.revision < 1 || audit.reportKey !== reportKey) {
        throw new Error('Relatorio ou auditoria invalida.');
      }
      if (report.spreadsheetId && report.spreadsheetId !== spreadsheetId) {
        throw new Error('Relatorio ja vinculado a outra planilha; nao sera reenviado para destino diferente.');
      }
      if (delivered && !report.spreadsheetId) throw new Error('Relatorio precisa ter destino reservado antes da entrega.');
      let updated = report;
      if (!report.spreadsheetId) {
        updated = { ...report, spreadsheetId };
      } else if (delivered && report.status === 'pendente') {
        updated = {
          ...report, status: 'entregue', deliveredAt: new Date(this.transaction.now()).toISOString(),
          deliveredBy: actor.trim(), deliveredByComputer: this.transaction.computerId,
        };
      }
      if (updated !== report) {
        const documents = { ...current.documents, [reportKey]: await this.transaction.stage(lease, updated) };
        const committed = await this.transaction.commit(lease, documents);
        lease = committed.lease;
        const verified = await this.transaction.current();
        if (!verified || verified.revision !== committed.revision ||
            JSON.stringify(await this.transaction.readDocument(verified, reportKey)) !== JSON.stringify(updated)) {
          throw new Error('Estado do relatorio nao foi verificado; consulte antes de repetir.');
        }
      }
      result = { report: updated, audit };
    } catch (error) {
      failure = error;
    }
    try {
      await this.transaction.release(lease);
    } catch (error) {
      if (failure) throw new AggregateError([failure, error], 'Relatorio falhou e lock nao foi liberado; consulte o estado.');
      throw new Error('Estado do relatorio alterado, mas lock nao foi liberado; consulte o estado.', { cause: error });
    }
    if (failure) throw failure;
    return result;
  }
}
