import { JSDOM } from 'jsdom';

// Monta o campo localizacao em valor literal (sem slug).
// Compatibilidade:
// 1) extractLocalizacao(cardHtml)
// 2) extractLocalizacao(bairro, cidade)
export function extractLocalizacao(cardHtmlOrBairro, cidadeArg) {
  // Assinatura antiga: bairro + cidade
  if (typeof cidadeArg !== 'undefined') {
    const partes = [cardHtmlOrBairro, cidadeArg].filter((valor) => typeof valor === 'string' && valor.trim());
    return partes.join(' - ');
  }

  const cardHtml = cardHtmlOrBairro;
  if (!cardHtml || typeof cardHtml !== 'string') return '';

  const dom = new JSDOM(cardHtml);
  const doc = dom.window.document;

  const heading = doc.querySelector('h2.card-with-buttons__heading')?.textContent?.trim() || '';
  if (heading) return heading;

  const partes = [cardHtmlOrBairro, cidadeArg].filter((valor) => typeof valor === 'string' && valor.trim());
  return partes.join(' - ');
}
