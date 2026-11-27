import { randomUUID } from 'node:crypto';
import { aplicarCorrecoesBairroAlugueis } from '../_1Jf/bairros-alugueis.js';
import { aplicarCorrecoesCidadeAlugueis } from '../_1Jf/cidades-alugueis.js';
import { aplicarCorrecoesTipoAlugueis } from '../_1Jf/tipos-alugueis.js';
import { aplicarCorrecoesFotoAlugueis } from '../_1Jf/fotos-alugueis.js';
import { identificarImovel, reconciliarLocacao, enriquecerLocacao } from '../_utils/locacaoSincronizacao.js';
import { buildUrlLocacao, getProjetoLocacao } from '../_utils/locacaoPadraoProjetos.js';
import { validateCatalogs, validateListings, UNIVERSAL_SALES_DOCUMENTS } from './gcsVendas.js';

const PROJECT = 'jfUniversal';
const ACTIVE = 'crawler/jfUniversalLocacao.json';
const REMOVED = 'crawler/jfUniversalRetiradosLocacao.json';
const PROVENANCE = '_piloto-jf/origem.json';
const CITIES = '_03database/filtros/_brCidades.json';
const NEIGHBORHOODS = '_03database/filtros/_jfBairros.json';
const TYPES = '_03database/filtros/_brTipoImovel.json';
const CORRECTIONS = [
  '_03database/outros/alugueis-bairro-correcoes.json',
  '_03database/outros/alugueis-cidade-correcoes.json',
  '_03database/outros/alugueis-tipo-imovel-correcoes.json',
  '_03database/outros/alugueis-linkfoto-correcoes.json',
];
export const UNIVERSAL_RENT_DOCUMENTS = [ACTIVE, REMOVED, CITIES, NEIGHBORHOODS, TYPES, ...CORRECTIONS, PROVENANCE];

export async function collectUniversalRent({ catalogos } = {}) {
  validateCatalogs(catalogos);
  const [{ abrirBrowser }, { contarAntesDaLocacaoPadrao }, { extractUniversalData }, { enrichImoveisWithInternalData }] =
    await Promise.all([
      import('../../../services/puppeteerPool.js'),
      import('../_utils/locacaoContagem.js'),
      import('./extractor.js'),
      import('./extractor-00-rotaInterna.js'),
    ]);
  const url = buildUrlLocacao(getProjetoLocacao('universal').urlVenda);
  const browser = await abrirBrowser();
  try {
    const totalEsperado = await contarAntesDaLocacaoPadrao(browser, { projeto: PROJECT, url, salvar: false });
    const imoveis = await extractUniversalData(browser, [url], {
      negociacao: 'locacao', totalEsperado, catalogos, liberarMemoria: true,
    });
    validateListings(imoveis);
    await enriquecerLocacao(browser, imoveis, enrichImoveisWithInternalData, { negociacao: 'aluguel', exigirDetalhes: true });
    return { totalEsperado, imoveis };
  } finally {
    await browser.close();
  }
}

export async function runJfRentGcs({ store, actor, project, operationId = randomUUID(), collect }) {
  const hostnames = { jfUniversal: 'universalimoveis.com.br', jfAlicerce: 'alicerceimob.com.br', jfAlmar: 'grupoalmar.com.br', jfBargon: 'bargonimoveis.com.br', jfBrasil: 'brasilimoveisjf.com.br', jfCasaNova: 'casanovajf.com.br' };
  const hostname = Object.hasOwn(hostnames, project) ? hostnames[project] : '';
  const active = `crawler/${project}Locacao.json`;
  const removed = `crawler/${project}RetiradosLocacao.json`;
  const scope = store?.transaction?.scope || '';
  if (!hostname || !/^piloto-jf-compartilhado-[a-zA-Z0-9_-]+$/.test(scope) ||
      typeof actor !== 'string' || !actor.trim() || actor.length > 200 || typeof collect !== 'function' ||
      typeof operationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(operationId)) {
    throw new Error('Informe escopo compartilhado, operador e coleta validos.');
  }
  const documents = UNIVERSAL_RENT_DOCUMENTS.map(key => key === ACTIVE ? active : key === REMOVED ? removed : key);
  const snapshot = await store.read(documents);
  const values = snapshot.values;
  const origin = values[PROVENANCE];
  if (!origin || origin.version !== 1 || origin.status !== 'isolado-nao-oficial' || origin.scope !== scope ||
      origin.sourceScope !== 'base-preparacao-inicial' || origin.sourceRevision !== 1 ||
      JSON.stringify(origin.universalDocuments) !== JSON.stringify(UNIVERSAL_SALES_DOCUMENTS)) {
    throw new Error('Proveniencia da base compartilhada invalida.');
  }
  if (!Array.isArray(values[active]) || !Array.isArray(values[removed]) ||
      values[active].some(item => !item || typeof item !== 'object' || Array.isArray(item)) ||
      values[removed].some(item => !item || typeof item !== 'object' || Array.isArray(item)) ||
      CORRECTIONS.some(key => !Array.isArray(values[key]) ||
        values[key].some(item => !item || typeof item !== 'object' || Array.isArray(item)))) {
    throw new Error('Historico, anuncios ou correcoes de aluguel invalidos; dados preservados.');
  }
  const catalogos = { cidades: values[CITIES], bairros: values[NEIGHBORHOODS], tipos: values[TYPES] };
  validateCatalogs(catalogos);
  const manifest = await store.transaction.current();
  if (!manifest || manifest.revision !== snapshot.revision) throw new Error('Base mudou antes da coleta; releia antes de repetir.');
  if (Object.hasOwn(manifest.documents, `controles/operacoes/${operationId}.json`) ||
      Object.hasOwn(manifest.documents, `controles/relatorios/${operationId}.json`)) {
    throw new Error('Operacao ja registrada; consulte o estado antes de repetir.');
  }
  const { totalEsperado, imoveis } = await collect({ catalogos });
  if (!Number.isSafeInteger(totalEsperado) || totalEsperado < 0 || !Array.isArray(imoveis) ||
      imoveis.length !== totalEsperado) throw new Error('Coleta de aluguel incompleta; dados preservados.');
  validateListings(imoveis, hostname);
  const previous = values[active];
  const result = reconciliarLocacao(imoveis, previous, project, { totalEsperado, vazioConfirmado: totalEsperado === 0 });
  result.ativos = aplicarCorrecoesBairroAlugueis(result.ativos, project, undefined, values[CORRECTIONS[0]]);
  result.ativos = aplicarCorrecoesCidadeAlugueis(result.ativos, project, undefined, values[CORRECTIONS[1]]);
  result.ativos = aplicarCorrecoesTipoAlugueis(result.ativos, project, undefined, values[CORRECTIONS[2]]);
  result.ativos = aplicarCorrecoesFotoAlugueis(result.ativos, project, undefined, values[CORRECTIONS[3]]);
  const history = [...values[removed]];
  const ids = new Set(history.map(item => item.retiradaId));
  for (const item of result.retirados) {
    if (ids.has(item.retiradaId)) continue;
    history.push({ ...item, dataExclusao: item.dataExclusao || new Date().toISOString() });
    ids.add(item.retiradaId);
  }
  const oldKeys = new Set(previous.map(item => identificarImovel(item)));
  const summary = {
    project, negociacao: 'aluguel', totalEsperado, ativos: result.ativos.length,
    novos: result.ativos.filter(item => !oldKeys.has(identificarImovel(item))).length,
    retirados: result.retirados.length,
  };
  const committed = await store.commit(snapshot, {
    operationId, actor, type: 'raspagem', changes: { [active]: result.ativos, [removed]: history }, report: summary,
  });
  return { ...committed, summary };
}

export function runUniversalRentGcs({ collect = collectUniversalRent, ...options }) {
  return runJfRentGcs({ ...options, project: PROJECT, collect });
}
