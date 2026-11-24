import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gerarLinksBuscaAuto } from './extractor-00-rotaExterna.js';
import { extractSouzaRochaData } from './extractor.js';
import { extractPreco } from './extractor-03-preco.js';
import { extractCodigoBase } from './extractor-14-codigoBase.js';
import { extractTipoImovelDoLink } from './extractor-05-tipoImovel.js';

test('Souza Rocha resolve tipo ausente pelo slug do link consultando o catalogo', () => {
  assert.equal(extractTipoImovelDoLink('https://souzarochaimoveis.com.br/im%C3%B3vel/amazonia-casa-3-4suitegarterraco/'), 'casa');
  assert.equal(extractTipoImovelDoLink('https://souzarochaimoveis.com.br/imóvel/av-andradas-morro-da-gloria-cobertura-4-4/'), 'cobertura');
  assert.equal(extractTipoImovelDoLink('/imóvel/centro-casa-comercial-com-garagem/'), 'casa-comercial');
  assert.equal(extractTipoImovelDoLink('/imóvel/cobertura-duplex-com-suite/'), 'cobertura');
  assert.equal(extractTipoImovelDoLink('/imóvel/centro-galp%C3%A3o/'), 'galpao');
});

test('Souza Rocha nao procura tipo no dominio, query ou fragmentos de palavras', () => {
  assert.equal(extractTipoImovelDoLink('https://casa.example/imóvel/casamento/?tipo=casa#cobertura'), '');
  assert.equal(extractTipoImovelDoLink('/imóvel/sem-tipo-conhecido/'), '');
  assert.equal(extractTipoImovelDoLink(''), '');
});

test('Souza Rocha aplica fallback no fluxo e preserva tipo preenchido pelo HTML', () => {
  const card = content => `<div class="rh_list_card__wrap">
    <a href="https://souzarochaimoveis.com.br/imóvel/amazonia-casa-3-4suitegarterraco/">Imovel</a>
    <span class="status">Venda</span>${content}</div>`;
  assert.equal(extractSouzaRochaData(card('')).imoveisRaspados[0].tipoImovel, 'casa');
  assert.equal(extractSouzaRochaData(card('<div class="rh_content"><span style="color: #000000;">Apartamento</span></div>')).imoveisRaspados[0].tipoImovel, 'apartamento');
});

test('Souza Rocha pagina todas as vendas preservando o filtro e os seis cards por pagina', async () => {
  let destination;
  let closed = false;
  const page = {
    goto: async url => { destination = url; return { status: () => 200 }; },
    content: async () => '<div class="rh_pagination__stats">1 para 6 fora de 24 imóveis</div>' + '<div class="rh_list_card__wrap"></div>'.repeat(6),
    close: async () => { closed = true; },
  };
  const links = await gerarLinksBuscaAuto({ newPage: async () => page });
  assert.equal(links.length, 4);
  assert.equal(new URL(destination).searchParams.get('status[]'), 'venda');
  assert.ok(links.every(link => new URL(link).searchParams.get('status[]') === 'venda'));
  assert.equal(new URL(links[3]).pathname, '/pesquisa/page/4/');
  assert.equal(closed, true);
});

test('Souza Rocha reconhece Venda pelo texto mesmo com classes extras ou espacos', () => {
  const html = '<div class="rh_list_card__wrap"><span class="status destaque">\n Venda \n</span></div><div class="rh_list_card__wrap"><span class="status">Aluguel</span></div><div class="rh_list_card__wrap"><span class="status">Aluguel, Venda</span></div>';
  assert.equal(extractSouzaRochaData(html).imoveisRaspados.length, 2);
});

test('Souza Rocha nao concatena preco de venda com locacao ou IPTU do card misto', () => {
  for (const html of ['<ins class="property-current-price">R$345.000 <span>Locação 2900+IPTU</span></ins>', '<p class="price">R$345.000 <span>Locação 2900+IPTU</span></p>']) {
    assert.equal(extractPreco(html), 345000);
  }
  assert.equal(extractPreco('<p class="price">R$ 345.000,50</p>'), 345000.5);
});

test('Souza Rocha trata Nenhum como ausencia de codigo sem perder referencias reais', () => {
  const html = value => `<div class="rh_property__id"><p class="id">${value}</p></div>`;
  assert.equal(extractCodigoBase(html('Nenhum')), '');
  assert.equal(extractCodigoBase(html(' nenhum ')), '');
  assert.equal(extractCodigoBase(html('RH-16280-')), 'RH16280');
});

test('Souza Rocha aborta descoberta com HTTP invalido ou cards ausentes', async () => {
  for (const status of [200, 503]) {
    let closed = false;
    const page = { goto: async () => ({ status: () => status }), content: async () => '<div class="rh_pagination__stats">1 para 6 fora de 24 imóveis</div>', close: async () => { closed = true; } };
    await assert.rejects(gerarLinksBuscaAuto({ newPage: async () => page }), /indisponivel|sem cards/);
    assert.equal(closed, true);
  }
});