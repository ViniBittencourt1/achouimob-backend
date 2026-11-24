import { parseTotalVendas } from '../_utils/vendasContagem.js';
import { projetoContagemVendas } from '../_utils/vendasContagemProjetos.js';

export function readSnapshotFogelVendas() {
  const cards = new Map();
  for (const root of document.querySelectorAll('div.feat_property.search-feat-card')) {
    const anchor = root.querySelector('a[href*="/detalhes/"]');
    if (!anchor) continue;
    const url = new URL(anchor.href);
    if (url.origin !== new URL(document.URL).origin || !url.pathname.startsWith('/detalhes/')) continue;
    url.search = '';
    url.hash = '';
    cards.set(url.href, { linkReal: url.href, cardHtml: root.outerHTML, codigoBase: null, linkFoto: root.querySelector('img')?.src || '', dataInclusao: new Date().toISOString(), dataExclusao: '', atualizadoEm: '' });
  }
  const label = Array.from(document.querySelectorAll('span.heading-color.fw600')).map(element => element.textContent.trim()).find(text => /\d[\d.]*\s+resultados?\s*$/i.test(text)) || '';
  const active = document.querySelector('#searchResultsPagination button[data-page].is-active');
  const next = document.querySelector('#searchResultsPagination button[data-page-nav="next"]');
  return { label, pageIndex: active ? Number(active.dataset.page) : 0, nextEnabled: Boolean(next && !next.disabled && next.getAttribute('aria-disabled') !== 'true'), cards: [...cards.values()] };
}

export async function coletarCardsFogelVendas(browser, { url = 'https://fogel.com.br/pesquisa?transacao=Venda', totalEsperado } = {}) {
  const target = new URL(url);
  if (target.pathname !== '/pesquisa' || target.searchParams.get('transacao')?.toLowerCase() !== 'venda') throw new Error('[Fogel] Rota exclusiva de venda obrigatoria.');
  const page = await browser.newPage();
  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'accept-language': 'pt-BR,pt;q=0.9' });
    const response = await page.goto(target.href, { waitUntil: 'networkidle2', timeout: 90000 });
    if (!response?.ok()) {
      const error = new Error(`[Fogel] HTTP ${response?.status()}; base preservada.`);
      if (response?.status() === 403 || response?.status() === 429) error.code = 'FOGEL_BLOCKED';
      throw error;
    }
    const current = new URL(page.url());
    if (current.origin !== target.origin || current.pathname !== target.pathname || current.searchParams.get('transacao')?.toLowerCase() !== 'venda') throw new Error('[Fogel] Busca redirecionada; base preservada.');
    await page.waitForFunction(() => Array.from(document.querySelectorAll('span.heading-color.fw600')).some(element => /\d[\d.]*\s+resultados?\s*$/i.test(element.textContent)), { timeout: 30000 });
    let snapshot = await page.evaluate(readSnapshotFogelVendas);
    const total = parseTotalVendas(snapshot.label, projetoContagemVendas('jfFogel'));
    if (totalEsperado !== undefined && total !== totalEsperado) throw new Error('[Fogel] Total difere da precontagem; base preservada.');
    const cards = new Map();
    while (true) {
      if (parseTotalVendas(snapshot.label, projetoContagemVendas('jfFogel')) !== total) throw new Error('[Fogel] Total mudou durante a coleta; base preservada.');
      const before = cards.size;
      for (const card of snapshot.cards) cards.set(card.linkReal, card);
      console.log(`[Fogel] Pagina ${snapshot.pageIndex + 1}: ${cards.size}/${total} anuncios unicos.`);
      if (cards.size === total) return [...cards.values()];
      if (cards.size > total || cards.size === before || !snapshot.nextEnabled) throw new Error(`[Fogel] Coleta incompleta: ${cards.size}/${total}; base preservada.`);
      const previousPage = snapshot.pageIndex;
      await page.click('#searchResultsPagination button[data-page-nav="next"]');
      await page.waitForFunction(previous => {
        const active = document.querySelector('#searchResultsPagination button[data-page].is-active');
        return active && Number(active.dataset.page) === previous + 1 && document.querySelector('div.feat_property.search-feat-card a[href*="/detalhes/"]');
      }, { timeout: 30000 }, previousPage);
      snapshot = await page.evaluate(readSnapshotFogelVendas);
    }
  } finally { await page.close(); }
}