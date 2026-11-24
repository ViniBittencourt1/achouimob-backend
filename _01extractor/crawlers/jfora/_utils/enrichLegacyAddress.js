import { JSDOM } from 'jsdom';

export function extractLegacyAddress(html) {
  const dom = new JSDOM(html);
  const tags = dom.window.document.querySelector('#desc_tags');
  const campos = tags ? tags.querySelectorAll('p') : dom.window.document.querySelectorAll('p');
  const campo = Array.from(campos)
    .find((item) => /^\s*Endereço\s*:/i.test(item.textContent || ''));
  return campo?.textContent?.replace(/^\s*Endereço\s*:\s*/i, '').replace(/\s+/g, ' ').trim() || '';
}

export function appendLegacyAddress(localizacao, endereco) {
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