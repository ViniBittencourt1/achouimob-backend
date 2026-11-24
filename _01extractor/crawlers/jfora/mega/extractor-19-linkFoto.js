import { JSDOM } from 'jsdom';

// Retorna a data de exclusão do linkReal no banco de dados
// Deve ser preenchida quando o linkReal não for mais encontrado
export function getDataExclusao() {
  return new Date().toISOString();
}

// Extrai o link da foto de um card HTML
// cardHtml: string (HTML do card)
export function extractLinkFoto(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const doc = dom.window.document;

  const candidatos = [
    doc.querySelector('a.wpgb-handle-lb')?.getAttribute('href'),
    doc.querySelector('img[fifu-featured]')?.getAttribute('src'),
    doc.querySelector('img')?.getAttribute('src'),
    doc.querySelector('img')?.getAttribute('data-src'),
  ];

  for (const c of candidatos) {
    const src = String(c || '').trim();
    if (!src) continue;
    if (src.startsWith('http')) return src;
    return `https://megacasaimoveis.com.br${src.startsWith('/') ? '' : '/'}${src}`;
  }

  return '';
}
