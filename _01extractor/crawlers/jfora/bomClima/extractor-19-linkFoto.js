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
  // Busca todas as imagens do card
  const imgs = dom.window.document.querySelectorAll('img');
  if (imgs.length === 0) {
    console.warn('[extractLinkFoto] Nenhuma imagem encontrada no cardHtml');
  }
  for (const img of imgs) {
    // Critério: src válido e alt relacionado ao imóvel
    if (img.getAttribute('data-fullsize')) {
      console.log('[extractLinkFoto] data-fullsize:', img.getAttribute('data-fullsize'));
      return img.getAttribute('data-fullsize');
    }
    if (img.src) {
      console.log('[extractLinkFoto] src:', img.src);
      return img.src;
    }
    if (img.getAttribute('data-fallback')) {
      console.log('[extractLinkFoto] data-fallback:', img.getAttribute('data-fallback'));
      return img.getAttribute('data-fallback');
    }
  }
  console.warn('[extractLinkFoto] Nenhum link de foto válido encontrado para este card');
  return '';
}
