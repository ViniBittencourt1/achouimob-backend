import { JSDOM } from 'jsdom';

// Extrai o campo linkReal de um card HTML
// cardHtml: string (HTML do card)
export function extractLinkReal(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const doc = dom.window.document;
  // Primeiro tenta pelo <a>
  let href = '';
  const a = doc.querySelector('a');
  if (a && a.getAttribute('href')) {
    href = a.getAttribute('href');
  } else {
    // Se não encontrar <a>, tenta pelo <link rel="preload" itemprop="url">
    const link = doc.querySelector('link[rel="preload"][itemprop="url"]');
    if (link && link.getAttribute('href')) {
      href = link.getAttribute('href');
    }
  }
  if (href) {
    let fullUrl = href;
    // Sempre monta com domínio se começar com '/'
    if (href.startsWith('/')) {
      fullUrl = 'https://www.secimoveis.com.br' + href;
    }
    // Se for absoluto, mantém
    // Ignora links de paginação/listagem
    const regex = /\/imovel\/venda(\/?(\?.*)?)?$/;
    try {
      const urlObj = new URL(fullUrl);
      if (regex.test(urlObj.pathname + (urlObj.search || ''))) {
        return '';
      }
    } catch (e) {
      // Se der erro na URL, retorna vazio
      return '';
    }
    return fullUrl;
  }
  return '';
}
