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

function validateListings(records) {
  const links = new Set();
  for (const item of records) {
    if (!object(item) || typeof item.linkReal !== 'string') throw new Error('Imovel Universal sem link valido; dados preservados.');
    let url;
    try {
      url = new URL(item.linkReal);
    } catch (error) {
      throw new Error('Link Universal invalido; dados preservados.', { cause: error });
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        url.hostname.replace(/^www\./, '') !== 'universalimoveis.com.br' ||
        !/^\/+imovel\/.+/.test(url.pathname)) {
      throw new Error('Link fora do site Universal; dados preservados.');
    }
    const identity = url.pathname.replace(/^\/+/, '/');
    if (links.has(identity)) throw new Error('Links Universal duplicados; dados preservados.');
    links.add(identity);
  }
}

function validateCatalogs(catalogos) {
  const validItems = items => Array.isArray(items) && items.length > 0 &&
    items.every(item => object(item) && typeof item.nome === 'string' && item.nome.trim() &&
      typeof item.slug === 'string' && item.slug.trim());
  if (!catalogos || !validItems(catalogos.cidades) || !validItems(catalogos.bairros) ||
      (!object(catalogos.tipos) && !Array.isArray(catalogos.tipos)) || !validItems(collectTipos(catalogos.tipos))) {
    throw new Error('Catalogos do GCS ausentes ou invalidos; coleta nao iniciada.');
  }
}

function validateSource(values) {
  if (!Array.isArray(values[ACTIVE])) throw new Error('Base anterior Universal invalida; dados preservados.');
  validateListings(values[ACTIVE]);
  if (!Array.isArray(values[REMOVED]) || values[REMOVED].some(item => !object(item)) ||
      !object(values[HISTORY]) || (values[HISTORY][PROJECT] !== undefined && !object(values[HISTORY][PROJECT]))) {
    throw new Error('Historico Universal invalido; dados preservados.');
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

export async function runUniversalSalesGcs({ store, actor, operationId = randomUUID(), collect = collectUniversalSales, report }) {
  if (!/^piloto-jfuniversal-[a-zA-Z0-9_-]+$/.test(store?.transaction?.scope || '') ||
      typeof collect !== 'function' || typeof actor !== 'string' || !actor.trim() || actor.length > 200 ||
      typeof operationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(operationId)) {
    throw new Error('Informe armazenamento, operador e coleta para o piloto Universal.');
  }
  const snapshot = await store.read([...UNIVERSAL_SALES_DOCUMENTS, PROVENANCE]);
  const provenance = snapshot.values[PROVENANCE];
  if (!object(provenance) || provenance.version !== 1 || provenance.scope !== store.transaction.scope ||
      provenance.sourceScope !== 'base-preparacao-inicial' || provenance.sourceRevision !== 1 ||
      JSON.stringify(provenance.documents) !== JSON.stringify(UNIVERSAL_SALES_DOCUMENTS)) {
    throw new Error('Origem do piloto invalida; coleta nao iniciada.');
  }
  validateSource(snapshot.values);
  const manifest = await store.transaction.current();
  if (!manifest || manifest.revision !== snapshot.revision) throw new StaleSnapshotError();
  if (Object.hasOwn(manifest.documents, `controles/operacoes/${operationId}.json`) ||
      Object.hasOwn(manifest.documents, `controles/relatorios/${operationId}.json`)) {
    throw new Error('Operacao ja registrada; consulte o estado antes de repetir.');
  }
  const catalogos = { cidades: snapshot.values[CITIES], bairros: snapshot.values[NEIGHBORHOODS], tipos: snapshot.values[TYPES] };
  const { totalEsperado, imoveis } = await collect({ catalogos });
  if (!Number.isSafeInteger(totalEsperado) || totalEsperado < 0 || !Array.isArray(imoveis) ||
      imoveis.length !== totalEsperado) throw new Error('Coleta Universal incompleta ou sem contagem valida; dados preservados.');
  validateListings(imoveis);

  const previous = snapshot.values[ACTIVE];
  const existing = new Map(previous.map(item => [item.linkReal, structuredClone(item)]));
  const consolidated = consolidateData(imoveis, existing);
  const result = reconciliarVendas(imoveis, previous, consolidated, PROJECT, {
    totalEsperado, vazioConfirmado: totalEsperado === 0,
  });
  result.ativos = aplicarCorrecoesVendasDados(result.ativos, FILE, snapshot.values);
  const corrections = manualCorrectionMaps(FILE, snapshot.values[ARQUIVOS_CORRECOES_VENDAS[0][0]], snapshot.values[ARQUIVOS_CORRECOES_VENDAS[1][0]]);
  const duplicates = duplicateGroupsForFile(FILE, snapshot.values[GROUPS]);
  for (const item of result.ativos) applyManualCorrection(item, '', corrections);
  applyDuplicateGroups(result.ativos, duplicates);
  const history = mesclarHistoricoVendas(snapshot.values[REMOVED], result.retirados);
  const scrapeHistory = mergeScrapeHistory(snapshot.values[HISTORY], PROJECT, result.ativos);
  const previousById = new Map(previous.map(item => [identidadeBase(item), item]));
  const summary = {
    project: PROJECT, negociacao: 'venda', totalEsperado,
    ativos: result.ativos.length, novos: result.ativos.filter(item => !previousById.has(identidadeBase(item))).length,
    alterados: result.ativos.filter(item => {
      const old = previousById.get(identidadeBase(item));
      return old && comparableRecord(old) !== comparableRecord(item);
    }).length,
    retirados: result.retirados.length,
  };
  const committed = await store.commit(snapshot, {
    operationId, actor, type: 'raspagem',
    changes: { [ACTIVE]: result.ativos, [REMOVED]: history, [HISTORY]: scrapeHistory },
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
