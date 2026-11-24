import { JSDOM } from 'jsdom';

// Retorna a data de exclusão do linkReal no banco de dados
// Deve ser preenchida quando o linkReal não for mais encontrado
export function getDataExclusao() {
  return new Date().toISOString();
}

// Extrai o link da foto de um card HTML
// cardHtml: string (HTML do card)
export function extractLinkFoto(cardHtml) {
  if (!cardHtml) return '';

  const dom = new JSDOM(cardHtml);
  const candidatos = dom.window.document.querySelectorAll('img.cards_digital_carousel-image');

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
    const src = foto.getAttribute('src') || '';
    if (src) return src;

    const fallback = foto.getAttribute('data-fallback') || '';
    if (fallback) return fallback;
  }

  // Fallback: em alguns cards o style pode vir em outro nó/estrutura.
  // Neste caso, captura a primeira URL de imagem da CDN dentro do HTML do card.
  const htmlNormalizado = String(cardHtml)
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&');

  const matchDireto = htmlNormalizado.match(/https?:\/\/(?:img|imgs)\.kenlo\.io\/[^"'\s)<>]+/i);
  if (matchDireto?.[0]) return matchDireto[0];

  return '';
}
