import { load } from 'cheerio';
import { parseTotalLocacaoPadrao } from './locacaoContagem.js';

export async function coletarLocacaoPadrao(page, link, totalEsperado) {
  const initial = new URL(link);
  const current = new URL(page.url());
  if (initial.pathname !== '/imoveis' || initial.searchParams.get('negociacao') !== 'locacao' ||
      current.origin !== initial.origin || current.pathname !== initial.pathname || current.searchParams.get('negociacao') !== 'locacao') {
    throw new Error('A coleta exige uma busca de locacao sem redirecionamento; dados anteriores preservados.');
  }
  let html = await page.content();
  const expected = parseTotalLocacaoPadrao(load(html)('#title--label').text());
  if (totalEsperado !== undefined && expected !== totalEsperado) throw new Error('Total de locacao mudou antes da coleta; dados anteriores preservados.');
  const cards = new Map();
  for (let number = 1; number <= 51; number++) {
    const document = load(html);
    const before = cards.size;
    for (const element of document('.imovel-item').toArray()) {
      const href = document(element).find('a[href]').first().attr('href');
      if (!href) throw new Error('Card de locacao sem link; dados anteriores preservados.');
      const url = new URL(href, initial);
      if (url.origin !== initial.origin || !url.pathname.startsWith('/imovel/')) throw new Error('Link de locacao fora da busca; dados anteriores preservados.');
      cards.set(url.href, document(element).toString());
    }
    console.log(`[LocacaoPadrao] ${initial.hostname} pagina ${number}: ${cards.size}/${expected} alugueis unicos.`);
    if (cards.size === expected) return Array.from(cards.values());
    if (cards.size > expected || cards.size === before) throw new Error(`Paginacao de locacao incompleta ou sem progresso: ${cards.size}/${expected}; dados anteriores preservados.`);
    if (number === 51) break;
    const destination = new URL(initial);
    destination.searchParams.set('tmpl', 'imoveis/list_items');
    destination.searchParams.set('page', String(number + 1));
    const response = await page.evaluate(async url => {
      const result = await fetch(url, {
        cache: 'no-store', signal: AbortSignal.timeout(60000),
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      return { status: result.status, url: result.url, html: await result.text() };
    }, destination.href);
    if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status} na paginacao de locacao; dados anteriores preservados.`);
    const destinationUrl = new URL(response.url);
    if (destinationUrl.origin !== initial.origin || destinationUrl.pathname !== initial.pathname || destinationUrl.searchParams.get('negociacao') !== 'locacao') {
      throw new Error('Paginacao de locacao redirecionada; dados anteriores preservados.');
    }
    html = response.html;
  }
  throw new Error('Limite de paginacao de locacao atingido; dados anteriores preservados.');
}
