import { JSDOM } from 'jsdom';

// Extrai o campo localizacao de um card HTML
// cardHtml: string (HTML do card)
export function extractLocalizacao(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const normalize = (v) => String(v || '').replace(/\s+/g, ' ').trim();

  const locStart = dom.window.document.querySelector('.listing-title .iziopen');
  if (locStart?.textContent?.trim()) {
    return normalize(locStart.textContent);
  }

  const fullAddress = dom.window.document.querySelector('span[class*="fullAddress"]');
  if (fullAddress?.textContent?.trim()) {
    return normalize(fullAddress.textContent);
  }

  const listingTitle = dom.window.document.querySelector('.listing-title');
  if (listingTitle?.textContent?.trim()) {
    let txt = normalize(listingTitle.textContent);
    txt = txt.replace(/^Ref\.?\s*:\s*\S+\s*/i, '');

    const titulo = normalize(dom.window.document.querySelector('h4 a, h4')?.textContent || '');
    if (titulo) {
      const idxTitulo = txt.toLowerCase().indexOf(titulo.toLowerCase());
      if (idxTitulo >= 0) {
        txt = normalize(txt.slice(idxTitulo + titulo.length));
      }
    }

    txt = txt.replace(/\+\s*Detalhes\s*$/i, '').trim();
    if (/,.+\s-\s*[A-Z]{2}$/i.test(txt)) return txt;
  }

  const loc = dom.window.document.querySelector('.search-feat-card__location');
  return loc ? normalize(loc.textContent) : '';
}
