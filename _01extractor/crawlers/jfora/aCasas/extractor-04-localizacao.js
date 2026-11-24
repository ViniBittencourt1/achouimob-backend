import { JSDOM } from 'jsdom';

function normalizarLocalizacao(texto) {
  if (!texto) return '';

  let localizacao = texto
    .replace(/^\s*\|?\s*Bairro\s*:\s*/i, '')
    .replace(/\s*[-–—]\s*(?=,)/g, '')
    .replace(/\s*[-–—]\s*$/g, '')
    .replace(/\s*[,;]\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();

  localizacao = localizacao.replace(/\s*,\s*/g, ', ');
  localizacao = localizacao.replace(/,\s*$/g, '');
  return localizacao;
}

// Extrai o campo localizacao de um card HTML
// cardHtml: string (HTML do card)
export function extractLocalizacao(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const loc = dom.window.document.querySelector('.search-feat-card__location');

  if (!loc) return '';

  return normalizarLocalizacao(loc.textContent);
}

export function extractEnderecoFromHtml(html) {
  const dom = new JSDOM(html);
  const campo = Array.from(dom.window.document.querySelectorAll('li.matriz-localizacao-campo'))
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
