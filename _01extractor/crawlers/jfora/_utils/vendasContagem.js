import { registrarTotalImoveis, registrarTotaisImoveis, SPREADSHEET_CONTAGEM_LOCACAO } from './locacaoContagem.js';
import { projetoContagemVendas } from './vendasContagemProjetos.js';
import { JF_SPREADSHEET_ID } from './jfSheetsConfig.js';
import { NITEROI_SPREADSHEET_ID } from '../niteroi/projects.js';
import { RIO_SPREADSHEET_ID } from '../rio/projects.js';
import { informarSiteDesativado, verificarSiteDesativado } from './siteDesativado.js';
import { installRemaxSearchBatches } from '../remax/paginacao-api.js';

export async function registrarTotalVendas(projeto, total, spreadsheetId = /^rio/i.test(projeto) ? RIO_SPREADSHEET_ID : /^jf/i.test(projeto) ? JF_SPREADSHEET_ID : NITEROI_SPREADSHEET_ID) {
  if (!/^(?:jf|nit|rio)[A-Za-z0-9-]+$/.test(projeto) || /Locacao|Retirados/.test(projeto)) throw new Error('Projeto de vendas invalido.');
  if (!spreadsheetId || spreadsheetId === SPREADSHEET_CONTAGEM_LOCACAO) throw new Error('Configure a planilha de vendas, diferente da planilha de aluguel.');
  return registrarTotalImoveis(projeto, total, spreadsheetId, 'Vendas');
}

export async function registrarTotaisVendas(entries, spreadsheetId) {
  for (const entry of entries) projetoContagemVendas(entry.projeto);
  if (spreadsheetId !== undefined) {
    if (!spreadsheetId || spreadsheetId === SPREADSHEET_CONTAGEM_LOCACAO) throw new Error('Configure a planilha de vendas, diferente da planilha de aluguel.');
    return registrarTotaisImoveis(entries, spreadsheetId, 'Vendas');
  }
  for (const [prefix, id] of [['jf', JF_SPREADSHEET_ID], ['nit', NITEROI_SPREADSHEET_ID], ['rio', RIO_SPREADSHEET_ID]]) {
    await registrarTotaisImoveis(entries.filter(entry => entry.projeto.startsWith(prefix)), id, 'Vendas');
  }
}

export function validarUrlContagemVendas(project, value) {
  const url = new URL(value);
  const expected = new URL(project.url);
  if (url.hostname.replace(/^www\./, '') !== expected.hostname.replace(/^www\./, '')) throw new Error('Contagem redirecionada para outro site; retorno preservado.');
  const rules = {
    realiza: () => url.pathname.replace(/\/$/, '') === '/venda',
    midas: () => url.pathname.replace(/\/$/, '') === '/imoveis/venda' && new URLSearchParams(url.hash.replace(/^#\/?\?/, '')).get('tipoNegocio') === 'VA,VL',
    c49: () => {
      const base = expected.pathname.replace(/\/$/, '');
      const pathname = url.pathname.replace(/\/$/, '');
      return pathname === base || (pathname.startsWith(`${base}/`) && /^[1-9]\d*$/.test(pathname.slice(base.length + 1)));
    },
    apresentame: () => url.pathname.replace(/\/$/, '') === '/imoveis/venda',
    padrao: () => url.searchParams.get('negociacao') === 'venda',
    imobbrasil: () => url.pathname.replace(/\/$/, '') === '/imovel/venda',
    imperial: () => url.pathname.replace(/\/$/, '') === '/imovel/venda',
    imobbrasilClassico: () => url.pathname.replace(/\/$/, '') === '/imovel/venda',
    kenlo: () => url.pathname.startsWith('/imoveis/a-venda'),
    predial: () => url.pathname === '/imoveis' && url.searchParams.get('finalidade') === 'venda',
    acervo: () => url.pathname.startsWith('/imoveis/a-venda/'),
    colibex: () => url.pathname === '/pesquisa' && url.searchParams.get('transacao')?.toLowerCase() === 'venda',
    soares: () => {
      const tipo = new URLSearchParams(url.hash.replace(/^#\/?\?/, '')).get('tipoNegocio');
      return url.pathname.replace(/\/+$/, '') === '/imoveis/venda' && (tipo === null || tipo === 'VA,VL');
    },
    start: () => url.pathname === '/imoveis.php' && url.searchParams.get('negocio') === '1',
    toc2: () => url.pathname.startsWith('/imoveis/venda/'),
    invest: () => url.pathname.toLowerCase() === '/resultadobusca.aspx' && url.searchParams.get('fin') === '1',
    mega: () => url.pathname === '/imovel/' && url.searchParams.get('_acao') === 'venda',
    remax: () => url.pathname === '/listings' && url.searchParams.get('TransactionTypeUID') === '261'
      && url.searchParams.get('City') === expected.searchParams.get('City')
      && (!expected.searchParams.has('Province') || url.searchParams.get('Province') === expected.searchParams.get('Province')),
    couto: () => url.pathname === '/search' && url.searchParams.get('acao') === 's1' && url.searchParams.get('finalidade_s') === '2',
    oliveira: () => url.pathname === '/localizar/localizar-imovel' && url.searchParams.get('filter[categoria_catid]') === '-40',
    kantto: () => url.pathname === '/venda' && url.searchParams.get('transacao') === '"venda"',
    souzaRocha: () => url.pathname === '/pesquisa/' && url.searchParams.get('status[]') === 'venda',
    lider: () => url.pathname === '/comprar',
    tecimob: () => url.pathname === '/comprar/imoveis',
  };
  if (!rules[project.kind]?.()) throw new Error('A contagem exige uma rota exclusiva de venda; retorno preservado.');
}

export function parseTotalVendas(label, project) {
  const text = String(label).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  if (/para alugar|locacao/i.test(text)) throw new Error('Contador de aluguel nao pode registrar vendas; retorno preservado.');
  const match = text.match(new RegExp(project.pattern, 'i'));
  const total = match ? Number(match[1].replace(/\./g, '')) : NaN;
  if (!Number.isSafeInteger(total) || total < 0) throw new Error(`[${project.collection}] Total de vendas nao identificado; retorno preservado.`);
  return total;
}

export function lerContagemVendasDOM(project) {
  const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  const labels = Array.from(document.querySelectorAll(project.selector)).map(element =>
    project.parentText ? element.parentElement.textContent :
      project.kind === 'predial' ? element.innerText : element.textContent);
  const pattern = new RegExp(project.pattern, 'i');
  const matchedLabel = labels.find(value => pattern.test(normalize(value)));
  const label = project.kind === 'predial' && matchedLabel !== undefined
    ? normalize(matchedLabel).match(pattern)[0].trim()
    : matchedLabel;
  const text = normalize(document.body.innerText || document.body.textContent);
  if (/\beste site esta temporariamente desativado\b/i.test(text)) {
    return { unavailable: true };
  }
  const heading = normalize(document.querySelector('h1')?.textContent);
  if (project.kind === 'predial' && !/^imoveis a venda em niteroi$/i.test(heading)) return false;
  if (project.collection === 'jfLider' && project.kind === 'imobbrasil' && heading.toLowerCase() !== 'imoveis disponiveis, venda') return false;
  if (project.kind === 'lider' && !/^imoveis a venda(?=\s|\d|$)/i.test(heading)) return false;
  if (project.kind === 'c49' && normalize(document.querySelector('.c49-filter-title')?.textContent).toLowerCase() !== 'imoveis a venda') return false;
  if (project.kind === 'soares' || project.kind === 'midas') {
    const soaresHeading = normalize((document.querySelector('h1.destaque-titulo') || document.querySelector('h1'))?.textContent);
    const headingTotal = soaresHeading.match(/^(\d[\d.]*)\s+imove(?:l|is)\s+(?:para (?:comprar|venda)|a venda)/i);
    const labelTotal = label === undefined ? null : normalize(label).match(pattern);
    if (!headingTotal || !labelTotal || Number(headingTotal[1].replace(/\./g, '')) !== Number(labelTotal[1].replace(/\./g, ''))) return false;
    if (Number(labelTotal[1].replace(/\./g, '')) > 0 && !document.querySelector('.box-imovel.ng-scope')) return false;
  }
  const confirmedEmpty = Boolean(project.empty && text.toLowerCase().includes(project.empty) && (project.kind !== 'kenlo' || /imoveis (?:a venda|para comprar)/i.test(heading)));
  if (label === undefined && !confirmedEmpty) return false;
  const rentalStatus = project.kind === 'souzaRocha' && Array.from(document.querySelectorAll('.rh_list_card__wrap .status')).some(element => !/^venda$/i.test(element.textContent.trim()));
  return { label, confirmedEmpty, rentalStatus };
}

export function esperaRetryAfter(response, padraoMs) {
  const header = response?.headers?.()?.['retry-after'];
  const segundos = Number(header);
  if (Number.isFinite(segundos) && segundos > 0) return Math.max(segundos * 1000, padraoMs);
  const data = Date.parse(header || '');
  return Number.isFinite(data) ? Math.max(data - Date.now(), padraoMs) : padraoMs;
}

export function recuperarBuscaSoaresDOM() {
  const root = document.querySelector('[ng-controller="Resultado2Controller"]');
  const scope = root && window.angular?.element(root).scope();
  if (!scope || typeof scope.atualizaImoveis !== 'function') return null;
  if (typeof window.jQuery?.fn?.flickity === 'function' || !scope.primeiroCarregamento || scope.buscandoImoveis) return false;
  // O erro do carrossel impede o site de chamar sua busca inicial.
  scope.$apply(() => scope.atualizaImoveis());
  return true;
}

export async function aguardarContagemVendas(page, project) {
  if (project.kind === 'soares') {
    await page.waitForFunction(() => {
      const root = document.querySelector('[ng-controller="Resultado2Controller"]');
      return root && typeof window.angular?.element(root).scope()?.atualizaImoveis === 'function';
    }, { timeout: 30000 });
    if (await page.evaluate(recuperarBuscaSoaresDOM)) {
      console.warn(`[${project.collection}] Carrossel Flickity indisponivel no site; busca nativa de imoveis iniciada diretamente.`);
    }
  }
  await page.waitForFunction(lerContagemVendasDOM, { timeout: 30000 }, project);
}

export async function contarAntesDasVendas(browser, { projeto, spreadsheetId, salvar = true, esperasBloqueioMs = [], userAgent } = {}) {
  const project = projetoContagemVendas(projeto);
  validarUrlContagemVendas(project, project.url);
  if (project.collection === 'rioMetropole') {
    const { contarMetropole } = await import('../rio/metropole.js');
    const total = await contarMetropole({ urlVendas: project.url });
    if (salvar) await registrarTotalVendas(project.collection, total, spreadsheetId);
    return total;
  }
  const page = await browser.newPage();
  let remaxSearch;
  try {
    if (userAgent) await page.setUserAgent(userAgent);
    if (project.kind === 'remax') {
      remaxSearch = await installRemaxSearchBatches(page, {
        cityId: Number(new URL(project.url).searchParams.get('City')),
        transactionType: 261,
      });
    }
    let listing;
    if (project.api) {
      listing = page.waitForResponse(response => {
        if (response.request().method() === 'OPTIONS' || !response.url().includes('/rpc/listar_imoveis_publicos')) return false;
        try { return JSON.parse(response.request().postData()).p_finalidade === 'venda'; } catch { return false; }
      }, { timeout: 45000 });
      listing.catch(() => {});
    }
    let response;
    let status;
    const esperasDnsMs = [2000, 4000];
    let tentativaDns = 0;
    let tentativaBloqueio = 0;
    for (;;) {
      try {
        response = await page.goto(project.url, { waitUntil: ['soares', 'remax'].includes(project.kind) ? 'networkidle2' : 'domcontentloaded', timeout: 90000 });
      } catch (error) {
        if (!/net::ERR_(?:NAME_NOT_RESOLVED|NAME_RESOLUTION_FAILED)\b/.test(error?.message || '')) throw error;
        if (tentativaDns >= esperasDnsMs.length) {
          throw new Error(`[${projeto}] Falha de DNS para ${new URL(project.url).hostname} apos ${tentativaDns + 1} tentativas. Verifique a conexao e o DNS; retorno preservado.`, { cause: error });
        }
        const espera = esperasDnsMs[tentativaDns++];
        console.warn(`[${projeto}] ${error.message}. Nova tentativa de DNS ${tentativaDns}/${esperasDnsMs.length} em ${espera / 1000}s.`);
        await new Promise(resolve => setTimeout(resolve, espera));
        continue;
      }
      status = response?.status() ?? 0;
      if (status !== 429 || tentativaBloqueio >= esperasBloqueioMs.length) break;
      const espera = esperaRetryAfter(response, esperasBloqueioMs[tentativaBloqueio++]);
      console.warn(`[${projeto}] HTTP 429 (limite de acessos) na contagem; nova tentativa ${tentativaBloqueio}/${esperasBloqueioMs.length} em ${Math.round(espera / 1000)}s.`);
      await new Promise(resolve => setTimeout(resolve, espera));
    }
    if ((status < 200 || status >= 400) && !(project.kind === 'kenlo' && status === 404)) {
      const error = new Error(`HTTP ${status} na contagem de vendas de ${projeto}; retorno preservado.`);
      if (status === 403 || status === 429) error.code = `${projeto.replace(/^(?:jf|nit)/, '').toUpperCase()}_BLOCKED`;
      throw error;
    }
    if (remaxSearch) {
      console.log(`[${projeto}] Aguardando contagem da API RE/MAX filtrada por cidade e venda (261).`);
      await verificarSiteDesativado(page, project.collection, { salvar, spreadsheetId });
      const total = await remaxSearch.waitUntilReady();
      remaxSearch.assertHealthy();
      if (salvar) await registrarTotalVendas(project.collection, total, spreadsheetId);
      return total;
    }
    validarUrlContagemVendas(project, page.url());
    let total;
    if (listing) {
      await verificarSiteDesativado(page, project.collection, { salvar, spreadsheetId });
      const api = await listing;
      if (!api.ok()) throw new Error(`API de contagem ${projeto} indisponivel; retorno preservado.`);
      const data = await api.json();
      if (!Array.isArray(data) || !data.length) throw new Error('API sem total explicito; retorno preservado.');
      total = Number(data[0].total_count);
      if (!Number.isSafeInteger(total) || total < data.length) throw new Error('Total da API invalido; retorno preservado.');
    } else {
      await aguardarContagemVendas(page, project);
      const info = await page.evaluate(lerContagemVendasDOM, project);
      if (info?.unavailable) {
        await informarSiteDesativado(project.collection, { salvar, spreadsheetId });
      }
      if (!info || info.rentalStatus) throw new Error('Contagem ausente ou catalogo misto com aluguel; retorno preservado.');
      if (status === 404 && !info.confirmedEmpty) throw new Error('404 sem zero confirmado; retorno preservado.');
      total = info.label === undefined && info.confirmedEmpty ? 0 : parseTotalVendas(info.label, project);
    }
    if (salvar) await registrarTotalVendas(project.collection, total, spreadsheetId);
    return total;
  } finally {
    try { if (remaxSearch) await remaxSearch.close(); }
    finally { await page.close(); }
  }
}