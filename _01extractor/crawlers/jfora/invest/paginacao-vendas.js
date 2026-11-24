import { parseTotalVendas } from '../_utils/vendasContagem.js';
import { projetoContagemVendas } from '../_utils/vendasContagemProjetos.js';

const base = 'https://www.invest.com.br/ResultadoBusca.aspx?fin=1&tit=Imoveis-para-comprar-e-vender-em-juiz-de-foras';

export function validarPaginaInvestVendas(href, expectedPage) {
  const url = new URL(href, base);
  if (url.origin !== new URL(base).origin || url.pathname.toLowerCase() !== '/resultadobusca.aspx' || url.searchParams.get('fin') !== '1' || (expectedPage > 1 && Number(url.searchParams.get('pag')) !== expectedPage)) throw new Error('[Invest] Paginacao fora de vendas; base preservada.');
  return url.href;
}

export function readSnapshotInvestVendas(nextPage) {
  const next = Array.from(document.querySelectorAll('a[href]')).find(anchor => {
    const url = new URL(anchor.href);
    return url.origin === new URL(document.URL).origin && url.searchParams.get('fin') === '1' && Number(url.searchParams.get('pag')) === nextPage;
  });
  return { label: document.querySelector('#ContentPlaceHolder1_lblQuantidadeImoveisEncontrados h1')?.textContent || '', cards: Array.from(document.querySelectorAll('.property-box')).map(element => element.outerHTML), next: next?.href || '' };
}

export async function coletarPaginasInvestVendas(page, { totalEsperado } = {}) {
  const cards = [];
  const visited = new Set();
  let next = base;
  let expected;
  let number = 1;
  while (next) {
    const url = validarPaginaInvestVendas(next, number);
    if (visited.has(url)) throw new Error('[Invest] Pagina repetida; base preservada.');
    visited.add(url);
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    if (!response?.ok()) throw new Error(`[Invest] HTTP ${response?.status()}; coleta parcial nao sera salva.`);
    validarPaginaInvestVendas(page.url(), number);
    await page.waitForSelector('#ContentPlaceHolder1_lblQuantidadeImoveisEncontrados h1', { timeout: 30000 });
    const snapshot = await page.evaluate(readSnapshotInvestVendas, number + 1);
    const total = parseTotalVendas(snapshot.label, projetoContagemVendas('jfInvest'));
    if (expected === undefined) expected = total;
    if (total !== expected || (totalEsperado !== undefined && total !== totalEsperado)) throw new Error('[Invest] Total alterado ou diferente da precontagem; base preservada.');
    cards.push(...snapshot.cards);
    console.log(`[Invest] Pagina ${number}: ${cards.length}/${expected} anuncios.`);
    if (cards.length === expected) return cards;
    if (!snapshot.cards.length || cards.length > expected || !snapshot.next) throw new Error(`[Invest] Coleta incompleta ${cards.length}/${expected}; base preservada.`);
    next = snapshot.next;
    number++;
  }
  throw new Error('[Invest] Coleta incompleta; base preservada.');
}