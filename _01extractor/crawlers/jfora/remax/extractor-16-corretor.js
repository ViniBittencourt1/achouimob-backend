import { load } from 'cheerio';
import nomesRemax from '../../../../formatarNomeRemax.cjs';
const { formatarNomeRemax } = nomesRemax;

export function extractCorretor(html = '') {
  const document = load(String(html));
  for (const element of document('a[href]').toArray()) {
    const anchor = document(element);
    let url;
    try { url = new URL(anchor.attr('href'), 'https://www.remax.com.br/'); }
    catch { continue; }
    if (!/^(?:www\.)?remax\.com\.br$/i.test(url.hostname) || !/\/escritorios\/.+\/\d+\/?$/i.test(url.pathname)) continue;
    const name = anchor.text().trim() || anchor.attr('title') || anchor.attr('aria-label') || '';
    if (name.trim()) return formatarNomeRemax(name.replace(/\s+/g, ' ').trim());
  }
  return '';
}
