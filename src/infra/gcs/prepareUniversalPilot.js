import { UNIVERSAL_SALES_DOCUMENTS } from '../../../_01extractor/crawlers/jfora/universal/gcsVendas.js';

export async function prepareUniversalPilot({ source, destination, actor }) {
  if (source?.scope !== 'base-preparacao-inicial' ||
      !/^piloto-jfuniversal-[a-zA-Z0-9_-]+$/.test(destination?.scope || '') ||
      typeof actor !== 'string' || !actor.trim() || actor.length > 200) {
    throw new Error('Informe fonte preparada, escopo exclusivo do piloto e operador.');
  }
  const manifest = await source.current();
  const sourceState = await source.state();
  if (!manifest || manifest.revision !== 1 || sourceState.data.revision !== manifest.revision) {
    throw new Error('Fonte preparada ausente ou alterada; piloto nao criado.');
  }
  const values = {};
  for (const key of UNIVERSAL_SALES_DOCUMENTS) {
    if (!Object.hasOwn(manifest.documents, key)) throw new Error(`Documento obrigatorio ausente: ${key}.`);
    values[key] = await source.readDocument(manifest, key);
  }
  let lease = await destination.acquire(15 * 60 * 1000);
  let failure;
  let result;
  try {
    const state = await destination.state();
    if (state.data.revision !== 0 || state.data.current) throw new Error('Escopo do piloto ja existe; nao sera sobrescrito.');
    const documents = {};
    for (const [key, data] of Object.entries(values)) documents[key] = await destination.stage(lease, data);
    const provenance = {
      version: 1, scope: destination.scope, sourceScope: source.scope, sourceRevision: manifest.revision, sourceManifest: sourceState.data.current,
      actor: actor.trim(), computerId: destination.computerId, createdAt: new Date(destination.now()).toISOString(),
      documents: UNIVERSAL_SALES_DOCUMENTS,
    };
    documents['_piloto/origem.json'] = await destination.stage(lease, provenance);
    const committed = await destination.commit(lease, documents);
    lease = committed.lease;
    const verified = await destination.current();
    if (!verified || verified.revision !== committed.revision ||
        JSON.stringify(verified.documents) !== JSON.stringify(documents) ||
        JSON.stringify(await destination.readDocument(verified, '_piloto/origem.json')) !== JSON.stringify(provenance)) {
      throw new Error('Piloto nao foi verificado; consulte o estado antes de repetir.');
    }
    for (const [key, data] of Object.entries(values)) {
      if (JSON.stringify(await destination.readDocument(verified, key)) !== JSON.stringify(data)) {
        throw new Error(`Documento ${key} nao foi verificado; consulte o estado antes de repetir.`);
      }
    }
    result = { scope: destination.scope, revision: committed.revision, documents: UNIVERSAL_SALES_DOCUMENTS.length };
  } catch (error) {
    failure = error;
  }
  try {
    await destination.release(lease);
  } catch (error) {
    if (failure) throw new AggregateError([failure, error], 'Preparacao falhou e lock nao foi liberado; consulte o estado.');
    throw new Error('Piloto confirmado, mas lock nao foi liberado; consulte o estado.', { cause: error });
  }
  if (failure) throw failure;
  return result;
}
