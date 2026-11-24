
// Extrai o campo linkReal de um card HTML
// cardHtml: string (HTML do card)
export function extractLinkReal(cardHtml) {
  const parser = new globalThis.DOMParser();
  const doc = parser.parseFromString(cardHtml, 'text/html');
  const a = doc.querySelector('a');
  if (a && a.getAttribute('href')) {
    const href = a.getAttribute('href');
    const fullUrl = 'https://www.imobiliariadecisaojf.com.br' + href;
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
