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

  // Bairro literal no card
  const bairro = doc.querySelector('h2.card-title')?.textContent?.trim() || '';

  // Cidade literal no titulo do card: "Tipo em Cidade"
  const titulo = doc.querySelector('h3.card-text')?.textContent?.trim() || '';
  const partesTitulo = titulo.split(/\bem\b/i).map((s) => s.trim()).filter(Boolean);
  const cidade = partesTitulo.length >= 2 ? partesTitulo[partesTitulo.length - 1] : '';

  const partes = [bairro, cidade].filter((valor) => typeof valor === 'string' && valor.trim());
  return partes.join(' - ');
}
