import { UNIVERSAL_SALES_DOCUMENTS } from '../../../_01extractor/crawlers/jfora/universal/gcsVendas.js';

const LEASE_MS = 45 * 60 * 1000;
const ORIGIN = '_piloto-jf/origem.json';
const ARCHIVE = '_piloto-jf/universal-anterior/';

export async function prepareJfSharedPilot({ source, universal, destination, actor, progress = () => {} }) {
  if (source?.scope !== 'base-preparacao-inicial' ||
      !/^piloto-jfuniversal-[a-zA-Z0-9_-]+$/.test(universal?.scope || '') ||
      !/^piloto-jf-compartilhado-[a-zA-Z0-9_-]+$/.test(destination?.scope || '') ||
      typeof actor !== 'string' || !actor.trim() || actor.length > 200 || typeof progress !== 'function') {
    throw new Error('Informe as bases de origem, escopo compartilhado isolado e operador.');
  }
  let destinationLease = await destination.acquire(LEASE_MS);
  let universalLease;
  let failure;
  let result;
  try {
    const destinationState = await destination.state();
    if (destinationState.data.revision !== 0 || destinationState.data.current) {
      throw new Error('Escopo compartilhado ja existe; nenhuma versao foi sobrescrita.');
    }
    universalLease = await universal.acquire(LEASE_MS);
    const [sourceState, sourceManifest, universalState, universalManifest] = await Promise.all([
      source.state(), source.current(), universal.state(), universal.current(),
    ]);
    if (!sourceManifest || sourceManifest.revision !== 1 || sourceState.data.revision !== 1 ||
        !universalManifest || universalManifest.revision !== universalState.data.revision) {
      throw new Error('Bases de origem ausentes ou alteradas; preparacao cancelada.');
    }
    const originalProvenance = await universal.readDocument(universalManifest, '_piloto/origem.json');
    if (!originalProvenance || originalProvenance.version !== 1 || originalProvenance.scope !== universal.scope ||
        originalProvenance.sourceScope !== source.scope || originalProvenance.sourceRevision !== 1 ||
        JSON.stringify(originalProvenance.documents) !== JSON.stringify(UNIVERSAL_SALES_DOCUMENTS)) {
      throw new Error('Proveniencia do piloto Universal invalida.');
    }
    const sourceKeys = Object.keys(sourceManifest.documents);
    if (sourceKeys.some(key => key === ORIGIN || key.startsWith(ARCHIVE)) ||
        UNIVERSAL_SALES_DOCUMENTS.some(key => !Object.hasOwn(sourceManifest.documents, key) ||
          !Object.hasOwn(universalManifest.documents, key))) {
      throw new Error('Documentos de origem ausentes ou caminhos reservados ocupados.');
    }
    const oldKeys = Object.keys(universalManifest.documents).filter(key => key === '_piloto/origem.json' ||
      key.startsWith('controles/operacoes/') || key.startsWith('controles/relatorios/'));
    const unknownKeys = Object.keys(universalManifest.documents).filter(key =>
      !UNIVERSAL_SALES_DOCUMENTS.includes(key) && !oldKeys.includes(key));
    if (unknownKeys.length) throw new Error(`Documentos inesperados no piloto Universal: ${unknownKeys.join(', ')}.`);
    const entries = [
      ...sourceKeys.map(key => ({ key, from: UNIVERSAL_SALES_DOCUMENTS.includes(key) ? universal : source,
        manifest: UNIVERSAL_SALES_DOCUMENTS.includes(key) ? universalManifest : sourceManifest, sourceKey: key })),
      ...oldKeys.map(key => ({ key: `${ARCHIVE}${key}`, from: universal, manifest: universalManifest, sourceKey: key })),
    ];
    const documents = {};
    for (let i = 0; i < entries.length; i++) {
      if (i > 0 && i % 25 === 0) {
        destinationLease = await destination.renew(destinationLease, LEASE_MS);
        universalLease = await universal.renew(universalLease, LEASE_MS);
        progress(i, entries.length);
      }
      const entry = entries[i];
      const value = await entry.from.readDocument(entry.manifest, entry.sourceKey);
      const ref = await destination.stage(destinationLease, value);
      const verified = await destination.storage.readVersion(ref.name, ref.generation);
      if (JSON.stringify(verified.data) !== JSON.stringify(value)) {
        throw new Error(`Documento copiado nao foi verificado: ${entry.key}.`);
      }
      documents[entry.key] = ref;
    }
    const currentSource = await source.state();
    if (currentSource.data.revision !== sourceState.data.revision ||
        JSON.stringify(currentSource.data.current) !== JSON.stringify(sourceState.data.current)) {
      throw new Error('Base preparada mudou durante a copia; nenhuma versao foi confirmada.');
    }
    await universal.requireLease(universalLease);
    const provenance = {
      version: 1, status: 'isolado-nao-oficial', scope: destination.scope,
      sourceScope: source.scope, sourceRevision: sourceManifest.revision, sourceManifest: sourceState.data.current,
      universalScope: universal.scope, universalRevision: universalManifest.revision, universalManifest: universalState.data.current,
      universalDocuments: UNIVERSAL_SALES_DOCUMENTS, archivedUniversalDocuments: oldKeys,
      actor: actor.trim(), computerId: destination.computerId, createdAt: new Date(destination.now()).toISOString(),
    };
    documents[ORIGIN] = await destination.stage(destinationLease, provenance);
    destinationLease = await destination.renew(destinationLease, LEASE_MS);
    const committed = await destination.commit(destinationLease, documents);
    destinationLease = committed.lease;
    const verified = await destination.current();
    if (!verified || verified.revision !== committed.revision ||
        JSON.stringify(verified.documents) !== JSON.stringify(documents) ||
        JSON.stringify(await destination.readDocument(verified, ORIGIN)) !== JSON.stringify(provenance)) {
      throw new Error('Preparacao nao verificada; consulte o estado antes de repetir.');
    }
    result = {
      scope: destination.scope, revision: committed.revision, documents: Object.keys(documents).length,
      sourceRevision: sourceManifest.revision, universalRevision: universalManifest.revision,
    };
  } catch (error) {
    failure = error;
  }
  const releaseErrors = [];
  if (universalLease) {
    try { await universal.release(universalLease); } catch (error) { releaseErrors.push(error); }
  }
  try { await destination.release(destinationLease); } catch (error) { releaseErrors.push(error); }
  if (releaseErrors.length) {
    throw new AggregateError(failure ? [failure, ...releaseErrors] : releaseErrors,
      'Preparacao ou liberacao de locks falhou; consulte os estados antes de repetir.');
  }
  if (failure) throw failure;
  return result;
}
