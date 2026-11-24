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

  const bairro = doc.querySelector('h2.card-title')?.textContent?.trim() || '';
  const titulo = doc.querySelector('h3.card-text')?.textContent?.trim() || '';
  const partesTitulo = titulo.split(/\bem\b/i).map((s) => s.trim()).filter(Boolean);
  const cidade = partesTitulo.length >= 2 ? partesTitulo[partesTitulo.length - 1] : '';

  const partes = [bairro, cidade].filter((valor) => typeof valor === 'string' && valor.trim());
  return partes.join(' - ');
}

export function buildLocalizacaoFallback(bairro, cidade) {
  const lowerCaseWords = new Set(["a", "as", "da", "das", "de", "do", "dos", "e", "em", "no", "nos"]);
  const formatSlug = (slug) => String(slug || "").split("-").filter(Boolean)
    .map((part, index) => lowerCaseWords.has(part) && index > 0 ? part : part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  const bairroNome = formatSlug(bairro);
  const cidadeParts = String(cidade || "").split("-").filter(Boolean);
  const estado = cidadeParts.length > 1 && cidadeParts.at(-1).length === 2 ? cidadeParts.pop().toUpperCase() : "";
  const cidadeNome = formatSlug(cidadeParts.join("-"));
  return [bairroNome, cidadeNome && estado ? `${cidadeNome} - ${estado}` : cidadeNome].filter(Boolean).join(", ");
}
