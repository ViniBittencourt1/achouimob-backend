// Retorna a data de exclusão do linkReal no banco de dados
// Deve ser preenchida quando o linkReal não for mais encontrado
export function getDataExclusao() {
  return new Date().toISOString();
}

// Extrai o link da foto de um card HTML
// cardHtml: string (HTML do card)

import { JSDOM } from 'jsdom';
export function extractLinkFoto(cardHtml) {
  const dom = new JSDOM(cardHtml, { url: 'https://www.secimoveis.com.br' });
  try {
    for (const image of dom.window.document.querySelectorAll('img')) {
      if (image.closest('.slick-cloned')) continue;
      for (const attribute of ['data-flickity-lazyload', 'data-src', 'data-lazy', 'src', 'fallback-src']) {
        const value = image.getAttribute(attribute)?.trim();
        if (!value || !URL.canParse(value, dom.window.document.URL)) continue;
        const url = new URL(value, dom.window.document.URL);
        if (['http:', 'https:'].includes(url.protocol) && url.pathname.includes('/imoveis/fotos/')) return url.href;
      }
    }
    return '';
  } finally { dom.window.close(); }
}

export function extractLinkFotoDetalhe(html, linkReal) {
  const dom = new JSDOM(html, { url: linkReal });
  try {
    const images = dom.window.document.querySelectorAll('.slick-slide:not(.slick-cloned) img, img[onload*="finishLoadImageDetalhe"]');
    for (const image of images) {
      if (image.closest('.slick-cloned')) continue;
      for (const attribute of ['data-src', 'data-lazy', 'src']) {
        const value = image.getAttribute(attribute)?.trim();
        if (!value) continue;
        const url = new URL(value, linkReal);
        if (!['http:', 'https:'].includes(url.protocol) ||
            !url.pathname.includes('/imoveis/fotos/') ||
            url.href === image.getAttribute('fallback-src')) continue;
        return url.href;
      }
    }
    return '';
  } finally { dom.window.close(); }
}
