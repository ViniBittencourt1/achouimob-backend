// Extrai o código base do HTML do card
// cardHtml: string (HTML do card)
import { JSDOM } from 'jsdom';

export function extractCodigoBase(cardHtml) {
  const dom = new JSDOM(cardHtml);

  const refStart = dom.window.document.querySelector('.referencia');
  if (refStart?.textContent?.trim()) {
    const clean = refStart.textContent.replace(/\s+/g, ' ').trim();
    const matchStart = clean.match(/Ref\.?\s*:?\s*([^\s<]+)/i);
    if (matchStart?.[1]) return matchStart[1].trim();
  }

  const footerCode = dom.window.document.querySelector('span[class*="footerCode"]');
  if (footerCode?.textContent?.trim()) {
    const clean = footerCode.textContent.replace(/\s+/g, ' ').trim();
    const codeMatch = clean.match(/C[óo]d\.\s*([A-Z]{1,4}\d+)/i);
    if (codeMatch?.[1]) return codeMatch[1].toUpperCase();
  }

  const referencia = dom.window.document.querySelector('.search-feat-card__ref');
  if (referencia?.textContent?.trim()) {
    const clean = referencia.textContent.replace(/\s+/g, ' ').trim();
    const match = clean.match(/REF:\s*([^\s]+)/i);
    return match?.[1] || clean;
  }

  const matchRef = cardHtml.match(/REF:\s*([^<\s]+)/i);
  if (matchRef?.[1]) {
    return matchRef[1].trim();
  }

  const matchRefStart = cardHtml.match(/Ref\.?\s*:?\s*([^<\s]+)/i);
  if (matchRefStart?.[1]) {
    return matchRefStart[1].trim();
  }

  const matchKanttoUrl = cardHtml.match(/\/imovel\/[^"'\s>]+\/([A-Z]{1,4}\d+)\b/i);
  if (matchKanttoUrl?.[1]) {
    return matchKanttoUrl[1].toUpperCase();
  }

  const matchIdUrl = cardHtml.match(/\/detalhes\/(\d+)\.html/i);
  return matchIdUrl?.[1] || '';
}
