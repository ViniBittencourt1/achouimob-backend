import { JSDOM } from 'jsdom';

function slugToLabel(slug) {
  return String(slug || '')
    .replace(/-+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Extrai o campo localizacao de um card HTML
// cardHtml: string (HTML do card)
export function extractLocalizacao(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const doc = dom.window.document;

  const titulo = doc.querySelector('.wpgb-block-11, h3 a, h2 a, h4 a')?.textContent?.replace(/\s+/g, ' ').trim() || '';
  const matchTitulo = titulo.match(/(?:no|na)\s+(.+?)\s+em\s+Juiz\s+de\s+Fora/i);
  if (matchTitulo?.[1]) {
    return `${matchTitulo[1].trim()}, Juiz de Fora - MG`;
  }

  const link = doc.querySelector('a.wpgb-card-layer-link[href*="/imovel/"], a[href*="/imovel/"]')?.getAttribute('href') || '';
  const slugMatch = link.match(/\/imovel\/[^/]*-([a-z0-9-]+)-juiz-de-fora-mg\/?$/i);
  if (slugMatch?.[1]) {
    const bairro = slugToLabel(slugMatch[1]);
    return `${bairro}, Juiz de Fora - MG`;
  }

  return '';
}
