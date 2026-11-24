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
  const imgs = Array.from(dom.window.document.querySelectorAll('img'));
  if (!imgs.length) return '';

  // Prioriza a imagem do CDN de fotos (storage.robustcrm.com.br); o card pode
  // conter outros <img> antes dela (ícones, selos, whatsapp) que fariam o
  // primeiro querySelector('img') retornar um src errado/vazio.
  const fotoImg = imgs.find((img) => /storage\.robustcrm\.com\.br/i.test(img.getAttribute('src') || ''));
  if (fotoImg) return fotoImg.getAttribute('src') || '';

  const primeiraComSrc = imgs.find((img) => (img.getAttribute('src') || '').trim());
  return primeiraComSrc ? primeiraComSrc.getAttribute('src') : '';
}
