// Retorna a data de exclusão do linkReal no banco de dados
// Deve ser preenchida quando o linkReal não for mais encontrado
export function getDataExclusao() {
  return new Date().toISOString();
}

// Extrai o link da foto de um card HTML
// cardHtml: string (HTML do card)

import { JSDOM } from 'jsdom';
export function extractLinkFoto(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const doc = dom.window.document;
  // Busca a imagem dentro do container correto
  const container = doc.querySelector('div.GalleryPiecesProperties_container_img__TTJiQ');
  let img = null;
  if (container) {
    img = container.querySelector('img');
  }
  // Se não encontrar pelo container, busca a primeira img do HTML
  if (!img) {
    img = doc.querySelector('img');
  }
  return img && img.src ? img.src : '';
}
