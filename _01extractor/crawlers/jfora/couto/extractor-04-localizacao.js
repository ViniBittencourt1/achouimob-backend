import { JSDOM } from 'jsdom';

// Extrai o campo localizacao de um card HTML
// cardHtml: string (HTML do card)
export function extractLocalizacao(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const loc = dom.window.document.querySelector('span.loc');
  return loc ? loc.textContent.replace(/\s+/g, ' ').trim() : '';
}

export function extractEnderecoFromHtml(html) {
  const dom = new JSDOM(html);
  const address = dom.window.document.querySelector('[itemprop="address"]');
  if (!address) return '';

  const rua = address.querySelector('[itemprop="streetAddress"]')?.textContent?.trim() || '';
  const localidades = Array.from(address.querySelectorAll('[itemprop="addressLocality"]'))
    .map((item) => item.textContent.trim())
    .filter(Boolean);
  const regiao = address.querySelector('[itemprop="addressRegion"]')?.textContent?.trim() || '';

  return [rua, ...localidades].filter(Boolean).join(', ')
    + (regiao ? ` - ${regiao}` : '');
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
