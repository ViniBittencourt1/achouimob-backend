import { JSDOM } from 'jsdom';

// Retorna a data de exclusÃ£o do linkReal no banco de dados
// Deve ser preenchida quando o linkReal nÃ£o for mais encontrado
export function getDataExclusao() {
  return new Date().toISOString();
}

// Extrai o link da foto de um card HTML
// cardHtml: string (HTML do card)
export function extractLinkFoto(cardHtml) {
  if (!cardHtml) return '';

  const dom = new JSDOM(cardHtml);
  const imagemKenlo = dom.window.document.querySelector('img.sp-image, img.card-img-top');
  if (imagemKenlo) {
    const url = (
      imagemKenlo.getAttribute('data-default') ||
      imagemKenlo.getAttribute('src') ||
      imagemKenlo.getAttribute('data-fallback') ||
      ''
    ).trim();
    if (url) return url;
  }

  const candidatos = dom.window.document.querySelectorAll('div.card-img-top');

  const extrairUrl = (texto) => {
    if (!texto) return '';

    const normalizado = texto
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&amp;/gi, '&');

    const match = normalizado.match(/url\((['"]?)(.*?)\1\)/i);
    if (!match?.[2]) return '';

    const url = match[2].trim();
    if (!url) return '';
    if (url.startsWith('//')) return `https:${url}`;
    return url;
  };

  for (const foto of candidatos) {
    const dataSrc = (foto.getAttribute('data-src') || '').trim();
    if (dataSrc) return dataSrc;

    const porStyleString = extrairUrl(foto.getAttribute('style') || '');
    if (porStyleString) return porStyleString;

    const porStyleObj = extrairUrl(foto.style?.backgroundImage || '');
    if (porStyleObj) return porStyleObj;
  }

  // Fallback: em alguns cards o style pode vir em outro nÃ³/estrutura.
  // Neste caso, captura a primeira URL de imagem da CDN dentro do HTML do card.
  const htmlNormalizado = String(cardHtml)
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&');

  const matchDireto = htmlNormalizado.match(/https?:\/\/(?:img|imgs)\.kenlo\.io\/[^"'\s)<>]+/i);
  if (matchDireto?.[0]) return matchDireto[0];

  return '';
}
