import { JSDOM } from 'jsdom';

// Extrai o campo localizacao de um card HTML
// cardHtml: string (HTML do card)
export function extractLocalizacao(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const h2 = dom.window.document.querySelector('h2.imovelcard__info__local');
  return h2 ? h2.textContent.trim() : '';
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

export function extractEnderecoFromHtml(html) {
  const dom = new JSDOM(html);
  const campo = Array.from(dom.window.document.querySelectorAll('p'))
    .find((item) => /^\s*Endereço\s*:/i.test(item.textContent || ''));
  return campo?.textContent?.replace(/^\s*Endereço\s*:\s*/i, '').replace(/\s+/g, ' ').trim() || '';
}

export function adicionarEnderecoNaLocalizacao(localizacao, endereco) {
  const localizacaoAtual = String(localizacao || '').trim();
  const enderecoAtual = String(endereco || '').trim();
  if (!enderecoAtual) return localizacaoAtual;
  if (!localizacaoAtual) return enderecoAtual;

  const normalizar = (valor) => valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  return normalizar(localizacaoAtual).includes(normalizar(enderecoAtual))
    ? localizacaoAtual
    : `${localizacaoAtual} - ${enderecoAtual}`;
}
