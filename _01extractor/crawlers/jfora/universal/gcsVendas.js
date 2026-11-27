import { randomUUID } from 'node:crypto';
import { manualCorrectionMaps, applyManualCorrection, duplicateGroupsForFile, applyDuplicateGroups, mergeScrapeHistory } from '../../../services/crawlerRecordRules.js';
import { ARQUIVOS_CORRECOES_VENDAS, aplicarCorrecoesVendasDados, identidadeBase, mesclarHistoricoVendas, reconciliarVendas } from '../_utils/vendasSincronizacao.js';
import { consolidateData } from './parser.js';
import { collectTipos } from './extractor-05-tipoImovel.js';
import { StaleSnapshotError } from '../../../../src/infra/gcs/operationalStore.js';

const PROJECT = 'jfUniversal';
const FILE = `${PROJECT}.json`;
const ACTIVE = `crawler/${FILE}`;
const REMOVED = 'crawler/jfUniversalRetiradosVendas.json';
const HISTORY = '_03database/filtros/jfHistoricoRaspagens.json';
const GROUPS = '_03database/outros/duplicados-grupos.json';
const PROVENANCE = '_piloto/origem.json';
const SHARED_PROVENANCE = '_piloto-jf/origem.json';
const CITIES = '_03database/filtros/_brCidades.json';
const NEIGHBORHOODS = '_03database/filtros/_jfBairros.json';
const TYPES = '_03database/filtros/_brTipoImovel.json';
export const UNIVERSAL_SALES_DOCUMENTS = [ACTIVE, REMOVED, HISTORY, GROUPS, ...ARQUIVOS_CORRECOES_VENDAS.map(([file]) => file), CITIES, NEIGHBORHOODS, TYPES];

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function comparableRecord(record) {
  const { atualizadoEm, ...fields } = record;
  return JSON.stringify(fields, (_key, value) => object(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
    : value);
}

export function validateListings(records, hostname = 'universalimoveis.com.br') {
  const links = new Set();
  for (const item of records) {
    if (!object(item) || typeof item.linkReal !== 'string') throw new Error('Imovel sem link valido; dados preservados.');
    let url;
    try {
      url = new URL(item.linkReal);
    } catch (error) {
      throw new Error('Link de imovel invalido; dados preservados.', { cause: error });
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        url.hostname.replace(/^www\./, '') !== hostname ||
        !/^\/+imovel\/.+/.test(url.pathname)) {
      throw new Error(`Link fora do site ${hostname}; dados preservados.`);
    }
    const identity = url.pathname.replace(/^\/+/, '/');
    if (links.has(identity)) throw new Error('Links duplicados; dados preservados.');
    links.add(identity);
  }
}

export function validateCatalogs(catalogos) {
  const validItems = items => Array.isArray(items) && items.length > 0 &&
    items.every(item => object(item) && typeof item.nome === 'string' && item.nome.trim() &&
      typeof item.slug === 'string' && item.slug.trim());
  if (!catalogos || !validItems(catalogos.cidades) || !validItems(catalogos.bairros) ||
      (!object(catalogos.tipos) && !Array.isArray(catalogos.tipos)) || !validItems(collectTipos(catalogos.tipos))) {
    throw new Error('Catalogos do GCS ausentes ou invalidos; coleta nao iniciada.');
  }
}

function validateSource(values, project, hostname, active, removed) {
  if (!Array.isArray(values[active])) throw new Error('Base anterior invalida; dados preservados.');
  validateListings(values[active], hostname);
  if (!Array.isArray(values[removed]) || values[removed].some(item => !object(item)) ||
      !object(values[HISTORY]) || (values[HISTORY][project] !== undefined && !object(values[HISTORY][project]))) {
    throw new Error('Historico de vendas invalido; dados preservados.');
  }
  const groups = values[GROUPS];
  if (!object(groups) || !object(groups.grupos) ||
      Object.values(groups.grupos).some(group => !object(group) || !Array.isArray(group.membros))) {
    throw new Error('Grupos de duplicados invalidos; dados preservados.');
  }
  for (const [file] of ARQUIVOS_CORRECOES_VENDAS) {
    if (!Array.isArray(values[file]) || values[file].some(item => !object(item))) {
      throw new Error(`Correcoes invalidas: ${file}; dados preservados.`);
    }
  }
  validateCatalogs({ cidades: values[CITIES], bairros: values[NEIGHBORHOODS], tipos: values[TYPES] });
}

export async function collectUniversalSales({ catalogos } = {}) {
  validateCatalogs(catalogos);
  const [{ abrirBrowser }, { contarAntesDasVendas }, { rotaVendasPadrao }, { extractUniversalData }, { enrichImoveisWithInternalData }] =
    await Promise.all([
      import('../../../services/puppeteerPool.js'),
      import('../_utils/vendasContagem.js'),
      import('../_utils/vendasPadraoPaginacao.js'),
      import('./extractor.js'),
      import('./extractor-00-rotaInterna.js'),
    ]);
  const browser = await abrirBrowser();
  try {
    const totalEsperado = await contarAntesDasVendas(browser, { projeto: PROJECT, salvar: false });
    const imoveis = await extractUniversalData(browser, [rotaVendasPadrao(PROJECT)], { totalEsperado, catalogos, liberarMemoria: true });
    validateListings(imoveis);
    await enrichImoveisWithInternalData(browser, imoveis, { exigirDetalhes: true });
    return { totalEsperado, imoveis };
  } finally {
    await browser.close();
  }
}

export async function runJfSalesGcs({ store, actor, project, operationId = randomUUID(), collect, report }) {
  const hostnames = { jfUniversal: 'universalimoveis.com.br', jfAlicerce: 'alicerceimob.com.br', jfAlmar: 'grupoalmar.com.br', jfBargon: 'bargonimoveis.com.br', jfBrasil: 'brasilimoveisjf.com.br', jfCasaNova: 'casanovajf.com.br' };
  const hostname = Object.hasOwn(hostnames, project) ? hostnames[project] : '';
  const file = `${project}.json`;
  const active = `crawler/${file}`;
  const removed = `crawler/${project}RetiradosVendas.json`;
  const scope = store?.transaction?.scope || '';
  const shared = /^piloto-jf-compartilhado-[a-zA-Z0-9_-]+$/.test(scope);
  if (!hostname || (!shared && (project !== PROJECT || !/^piloto-jfuniversal-[a-zA-Z0-9_-]+$/.test(scope))) ||
      typeof collect !== 'function' || typeof actor !== 'string' || !actor.trim() || actor.length > 200 ||
      typeof operationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(operationId)) {
    throw new Error('Informe armazenamento, operador e coleta para o piloto Universal.');
  }
  const provenanceKey = shared ? SHARED_PROVENANCE : PROVENANCE;
  const documents = UNIVERSAL_SALES_DOCUMENTS.map(key => key === ACTIVE ? active : key === REMOVED ? removed : key);
  const snapshot = await store.read([...documents, provenanceKey]);
  const provenance = snapshot.values[provenanceKey];
  if (!object(provenance) || provenance.version !== 1 || provenance.scope !== scope ||
      provenance.sourceScope !== 'base-preparacao-inicial' || provenance.sourceRevision !== 1 ||
      JSON.stringify(shared ? provenance.universalDocuments : provenance.documents) !== JSON.stringify(UNIVERSAL_SALES_DOCUMENTS) ||
      (shared && (provenance.status !== 'isolado-nao-oficial' ||
        !/^piloto-jfuniversal-[a-zA-Z0-9_-]+$/.test(provenance.universalScope || '') ||
        !Number.isSafeInteger(provenance.universalRevision) || provenance.universalRevision < 1))) {
    throw new Error('Origem do piloto invalida; coleta nao iniciada.');
  }
  validateSource(snapshot.values, project, hostname, active, removed);
  const manifest = await store.transaction.current();
  if (!manifest || manifest.revision !== snapshot.revision) throw new StaleSnapshotError();
  if (Object.hasOwn(manifest.documents, `controles/operacoes/${operationId}.json`) ||
      Object.hasOwn(manifest.documents, `controles/relatorios/${operationId}.json`)) {
    throw new Error('Operacao ja registrada; consulte o estado antes de repetir.');
  }
  const catalogos = { cidades: snapshot.values[CITIES], bairros: snapshot.values[NEIGHBORHOODS], tipos: snapshot.values[TYPES] };
  const { totalEsperado, imoveis } = await collect({ catalogos });
  if (!Number.isSafeInteger(totalEsperado) || totalEsperado < 0 || !Array.isArray(imoveis) ||
      imoveis.length !== totalEsperado) throw new Error('Coleta incompleta ou sem contagem valida; dados preservados.');
  validateListings(imoveis, hostname);

  const previous = snapshot.values[active];
  const existing = new Map(previous.map(item => [item.linkReal, structuredClone(item)]));
  const consolidated = consolidateData(imoveis, existing);
  const result = reconciliarVendas(imoveis, previous, consolidated, project, {
    totalEsperado, vazioConfirmado: totalEsperado === 0,
  });
  result.ativos = aplicarCorrecoesVendasDados(result.ativos, file, snapshot.values);
  const corrections = manualCorrectionMaps(file, snapshot.values[ARQUIVOS_CORRECOES_VENDAS[0][0]], snapshot.values[ARQUIVOS_CORRECOES_VENDAS[1][0]]);
  const duplicates = duplicateGroupsForFile(file, snapshot.values[GROUPS]);
  for (const item of result.ativos) applyManualCorrection(item, '', corrections);
  applyDuplicateGroups(result.ativos, duplicates);
  const history = mesclarHistoricoVendas(snapshot.values[removed], result.retirados);
  const scrapeHistory = mergeScrapeHistory(snapshot.values[HISTORY], project, result.ativos);
  const previousById = new Map(previous.map(item => [identidadeBase(item), item]));
  const summary = {
    project, negociacao: 'venda', totalEsperado,
    ativos: result.ativos.length, novos: result.ativos.filter(item => !previousById.has(identidadeBase(item))).length,
    alterados: result.ativos.filter(item => {
      const old = previousById.get(identidadeBase(item));
      return old && comparableRecord(old) !== comparableRecord(item);
    }).length,
    retirados: result.retirados.length,
  };
  const committed = await store.commit(snapshot, {
    operationId, actor, type: 'raspagem',
    changes: { [active]: result.ativos, [removed]: history, [HISTORY]: scrapeHistory },
    report: summary,
  });
  if (!report) return { ...committed, summary };
  try {
    const delivered = await report(operationId);
    return { ...committed, summary, reportStatus: delivered.status };
  } catch (error) {
    return { ...committed, summary, reportWarning: `Relatorio pendente: ${error.message}` };
  }

}

export function runUniversalSalesGcs({ collect = collectUniversalSales, ...options }) {
  return runJfSalesGcs({ ...options, project: PROJECT, collect });
}
