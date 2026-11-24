import { parseTotalVendas } from '../_utils/vendasContagem.js';
import { projetoContagemVendas } from '../_utils/vendasContagemProjetos.js';

export function readSnapshotKantto() {
  const cards = new Map();
  for (const anchor of document.querySelectorAll('div[class*="_card_"] a[href*="/imovel/"]')) {
    const url = new URL(anchor.href);
    if (url.origin !== new URL(document.URL).origin || !url.pathname.startsWith('/imovel/')) continue;
    url.search = '';
    url.hash = '';
    const root = anchor.closest('div[class*="_card_"]');
    cards.set(url.href, { linkReal: url.href, cardHtml: root.outerHTML, codigoBase: null, linkFoto: root.querySelector('img')?.src || '', dataInclusao: new Date().toISOString(), dataExclusao: '', atualizadoEm: '' });
  }
  return { label: document.querySelector('span[class*="list-search-header_numberOfResults"]')?.textContent || '', cards: [...cards.values()] };
}

export async function coletarCardsKantto(browser, { totalEsperado } = {}) {
  const url = 'https://www.kanttoimoveis.com.br/venda?transacao=%22venda%22';
  const page = await browser.newPage();
  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    console.log('[Kantto] Carregando pagina 1 (domcontentloaded; timeout 45s).');
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (!response?.ok()) {
      const error = new Error(`[Kantto] HTTP ${response?.status()}; base preservada.`);
      if ([403, 429].includes(response?.status())) error.code = 'KANTTO_BLOCKED';
      throw error;
    }
    const current = new URL(page.url());
    if (current.hostname !== 'www.kanttoimoveis.com.br' || current.pathname !== '/venda' || current.searchParams.get('transacao') !== '"venda"') throw new Error('[Kantto] Busca fora da venda; base preservada.');
    await page.waitForFunction(() => /\d[\d.]*\s+resultados?/i.test(document.querySelector('span[class*="list-search-header_numberOfResults"]')?.textContent || ''), { timeout: 30000 });
    let snapshot = await page.evaluate(readSnapshotKantto);
    const total = parseTotalVendas(snapshot.label, projetoContagemVendas('jfKantto'));
    if (totalEsperado !== undefined && total !== totalEsperado) throw new Error('[Kantto] Total difere da precontagem; base preservada.');
    const cards = new Map();
    const serverPageSize = 32;
    const pages = Math.max(1, Math.ceil(total / serverPageSize));
    for (let pageIndex = 0; pageIndex < pages; pageIndex++) {
      if (pageIndex > 0) {
        const next = new URL(url);
        next.searchParams.set('pagina', String(pageIndex + 1));
        console.log(`[Kantto] Carregando pagina ${pageIndex + 1}/${pages} (domcontentloaded; timeout 45s).`);
        const nextResponse = await page.goto(next.href, { waitUntil: 'domcontentloaded', timeout: 45000 });
        if (!nextResponse?.ok()) throw new Error(`[Kantto] HTTP ${nextResponse?.status()} na pagina ${pageIndex}; base preservada.`);
        await page.waitForFunction(() =>
          document.querySelector('div[class*="_card_"] a[href*="/imovel/"]') &&
          /\d[\d.]*\s+resultados?/i.test(document.querySelector('span[class*="list-search-header_numberOfResults"]')?.textContent || ''),
        { timeout: 30000 });
        snapshot = await page.evaluate(readSnapshotKantto);
      }
      const expectedOnPage = Math.min(serverPageSize, total - pageIndex * serverPageSize);
      const pageCards = new Map();
      while (true) {
        if (parseTotalVendas(snapshot.label, projetoContagemVendas('jfKantto')) !== total) throw new Error('[Kantto] Total mudou durante coleta; base preservada.');
        for (const card of snapshot.cards) { pageCards.set(card.linkReal, card); cards.set(card.linkReal, card); }
        console.log(`[Kantto] Pagina ${pageIndex + 1}/${pages}: ${pageCards.size}/${expectedOnPage}; total ${cards.size}/${total}.`);
        if (pageCards.size === expectedOnPage) break;
        if (pageCards.size > expectedOnPage || !snapshot.cards.length) throw new Error('[Kantto] Pagina inconsistente; base preservada.');
        const before = [...pageCards.keys()];
        console.log(`[Kantto] Aguardando novos cards da pagina ${pageIndex + 1}/${pages} (timeout 30s).`);
        await page.evaluate(() => Array.from(document.querySelectorAll('div[class*="_card_"]')).at(-1)?.scrollIntoView({ block: 'center' }));
        await page.waitForFunction(previous => {
          const links = new Set(previous);
          return Array.from(document.querySelectorAll('div[class*="_card_"] a[href*="/imovel/"]')).some(anchor => {
            const url = new URL(anchor.href); url.search = ''; url.hash = ''; return !links.has(url.href);
          });
        }, { timeout: 30000 }, before);
        snapshot = await page.evaluate(readSnapshotKantto);
      }
    }
    if (cards.size !== total) throw new Error(`[Kantto] Coleta incompleta ${cards.size}/${total}; base preservada.`);
    return [...cards.values()];
  } finally { await page.close(); }
}