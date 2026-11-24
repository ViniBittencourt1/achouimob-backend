
import { JSDOM } from 'jsdom';

// Extrai o valor do <span itemprop="name">...</span> como código base
export function extractCodigoBase(cardHtml) {
  if (!cardHtml) return '';
  const dom = new JSDOM(cardHtml);
  const doc = dom.window.document;

  const codigoCard = doc.querySelector('.wpgb-block-4, .wpgb-block-6')?.textContent?.trim() || '';
  if (codigoCard) return codigoCard.toUpperCase();

  const link = doc.querySelector('a.wpgb-card-layer-link[href*="/imovel/"], a[href*="/imovel/"]')?.getAttribute('href') || '';
  const slugMatch = link.match(/\/imovel\/([a-z]{2}\d{3,8})-/i);
  if (slugMatch?.[1]) return slugMatch[1].toUpperCase();

  return '';
}
