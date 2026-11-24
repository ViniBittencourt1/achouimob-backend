
// Extrai o campo linkReal de um card HTML
// cardHtml: string (HTML do card)
export function extractLinkReal(cardHtml) {
  const parser = new globalThis.DOMParser();
  const doc = parser.parseFromString(cardHtml, 'text/html');
  const a = doc.querySelector('a');
  if (a && a.getAttribute('href')) {
    const href = a.getAttribute('href');
    // Garante que o link seja absoluto
    const fullLink = 'https://www.rvnegociosimobiliariosjf.com.br' + href;
    // Filtra apenas links reais de imóveis
    const regexImovel = /^https:\/\/www\.rvnegociosimobiliariosjf\.com\.br\/imovel\/[0-9]+\//;
    if (regexImovel.test(fullLink)) {
      return fullLink;
    }
  }
  return '';
}
