
// Extrai o campo linkReal de um card HTML
// cardHtml: string (HTML do card)
export function extractLinkReal(cardHtml) {
  const hrefMatch = cardHtml.match(/<a[^>]+href=["']([^"']+)["']/i);
  if (!hrefMatch || !hrefMatch[1]) return '';

  const href = hrefMatch[1].trim();
  const fullUrl = href.startsWith('http')
    ? href
    : `https://www.imperialimoveisjf.com${href.startsWith('/') ? '' : '/'}${href}`;

  try {
    const parsed = new URL(fullUrl);
    const suffix = `${parsed.pathname}${parsed.search || ''}`;
    if (/\/imovel\/venda(\/?(\?.*)?)?$/i.test(suffix)) {
      return '';
    }
    return parsed.toString();
  } catch {
    return '';
  }
}
