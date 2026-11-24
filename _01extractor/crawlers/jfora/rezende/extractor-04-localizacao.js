import { JSDOM } from 'jsdom';

// Extrai o campo localizacao de um card HTML
// cardHtml: string (HTML do card)
export function extractLocalizacao(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const divLoc = dom.window.document.querySelector('div.imovel-item--localizacao');
  return divLoc ? divLoc.textContent.trim() : '';
}

export function extractRuaFromHtml(html) {
  const dom = new JSDOM(html);
  const endereco = dom.window.document.querySelector('.imovel--location--address a, .imovel--location--address');
  return endereco?.textContent?.replace(/\s+/g, ' ').trim() || '';
}

export function adicionarRuaNaLocalizacao(localizacao, endereco) {
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
