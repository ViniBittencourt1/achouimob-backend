import { load } from 'cheerio';
import { parseTotalVendas } from './vendasContagem.js';
import { projetoContagemVendas } from './vendasContagemProjetos.js';

export function rotaVendasPadrao(collection) {
  const url = new URL(projetoContagemVendas(collection).url);
  if (url.pathname !== '/imoveis' || url.searchParams.get('negociacao') !== 'venda') throw new Error('Rota de vendas padrao invalida.');
  url.searchParams.set('order', 'recentes');
  url.searchParams.delete('preco_min');
  url.searchParams.delete('preco_max');
  return url.href;
}

export async function coletarVendasPadrao(page, link, totalEsperado) {
  const initial = new URL(link);
  const current = new URL(page.url());
  if (initial.pathname !== '/imoveis' || initial.searchParams.get('negociacao') !== 'venda' || current.hostname.replace(/^www\./, '') !== initial.hostname.replace(/^www\./, '') || current.pathname !== '/imoveis' || current.searchParams.get('negociacao') !== 'venda') throw new Error('Busca redirecionada ou fora de vendas; base preservada.');
  let html = await page.content();
  const label = load(html)('#title--label').text();
  const total = parseTotalVendas(label, { collection: initial.hostname, pattern: '\\(\\s*(\\d[\\d.]*)\\s*\\)' });
  if (total !== totalEsperado) throw new Error(`Total mudou antes da coleta: ${total}/${totalEsperado}; base preservada.`);
  const cards = new Map();
  for (let number = 1; number <= 250; number++) {
    const document = load(html);
    const before = cards.size;
    for (const element of document('.imovel-item').toArray()) {
      const href = document(element).find('a[href]').first().attr('href');
      if (!href) throw new Error('Card sem link; base preservada.');
      const url = new URL(href, current);
      if (url.hostname.replace(/^www\./, '') !== current.hostname.replace(/^www\./, '') || !url.pathname.startsWith('/imovel/')) throw new Error('Link fora da busca; base preservada.');
      url.search = '';
      url.hash = '';
      cards.set(url.href, document(element).toString());
    }
    console.log(`[VendasPadrao] ${initial.hostname} pagina ${number}: ${cards.size}/${total} imoveis unicos.`);
    if (cards.size === total) return Array.from(cards.values());
    if (cards.size > total || cards.size === before) throw new Error(`Coleta incompleta ou sem progresso: ${cards.size}/${total}; base preservada.`);
    const destination = new URL(current);
    destination.search = initial.search;
    destination.searchParams.set('tmpl', 'imoveis/list_items');
    destination.searchParams.set('page', String(number + 1));
    const response = await page.evaluate(async url => {
      const result = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(60000), headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      return { status: result.status, url: result.url, html: await result.text() };
    }, destination.href);
    if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status} na paginacao; base preservada.`);
    const final = new URL(response.url);
    if (final.origin !== current.origin || final.pathname !== '/imoveis' || final.searchParams.get('negociacao') !== 'venda') throw new Error('Paginacao redirecionada; base preservada.');
    html = response.html;
  }
  throw new Error('Limite de paginacao atingido; base preservada.');
}