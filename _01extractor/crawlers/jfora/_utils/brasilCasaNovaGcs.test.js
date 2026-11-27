import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mock, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { extractTipoImovel as tipoBrasil } from '../brasil/extractor-05-tipoImovel.js';
import { extractBairro as bairroBrasil } from '../brasil/extractor-06-bairrojs.js';
import { extractCidadeFromCardHtml as cidadeBrasil } from '../brasil/extractor-07-cidade.js';
import { extractTipoImovel as tipoCasaNova } from '../casaNova/extractor-05-tipoImovel.js';
import { extractBairro as bairroCasaNova } from '../casaNova/extractor-06-bairrojs.js';
import { extractCidadeFromCardHtml as cidadeCasaNova } from '../casaNova/extractor-07-cidade.js';

const html = '<div class="imovel-item imovel-item-show"><a href="https://brasilimoveisjf.com.br/imovel/casa--centro--cidade_teste--mg--venda"></a><div class="imovel-item--localizacao">Centro, Cidade Teste</div><div class="imovel-item--tipo"><span>Casa</span></div></div>';
const catalogos = {
  cidades: [{ nome: 'Cidade Teste', slug: 'cidade-teste-mg', estado: 'MG' }],
  bairros: [{ nome: 'Centro', slug: 'centro-gcs', cidade: 'cidade-teste-mg', principal: 'sim' }],
  tipos: { tipos: [{ nome: 'Casa', slug: 'casa-gcs' }] },
};

test('Brasil e Casa Nova usam catalogos do snapshot sem leitura local', t => {
  new JSDOM('<div></div>').window.close();
  t.mock.method(fs, 'readFileSync', () => { throw new Error('Leitura local indevida'); });
  for (const [tipo, bairro, cidade] of [[tipoBrasil, bairroBrasil, cidadeBrasil], [tipoCasaNova, bairroCasaNova, cidadeCasaNova]]) {
    assert.equal(tipo(html, catalogos.tipos), 'casa-gcs');
    assert.equal(cidade(html, catalogos.cidades), 'cidade-teste-mg');
    const result = bairro === bairroBrasil
      ? bairro(html, 'cidade-teste-mg', '', catalogos.bairros)
      : bairro(html, '', catalogos.bairros);
    assert.equal(result, 'centro-gcs');
  }
  assert.equal(bairroBrasil('<div></div>', 'cidade-teste-mg',
    'https://brasilimoveisjf.com.br/imovel/casa--centro--cidade_teste--mg--venda', catalogos.bairros), 'centro-gcs');
});

let used;
let fail = false;
mock.module(new URL('./vendasPadraoPaginacao.js', import.meta.url), {
  namedExports: { coletarVendasPadrao: async (_page, _url, total) => { used = ['venda', total]; if (fail) throw new Error('incompleta'); return [html]; } },
});
mock.module(new URL('./locacaoPadraoPaginacao.js', import.meta.url), {
  namedExports: { coletarLocacaoPadrao: async (_page, _url, total) => { used = ['locacao', total]; if (fail) throw new Error('incompleta'); return [html]; } },
});
const { extractCasaNovaData } = await import('../casaNova/extractor.js');
const { extractBrasilData } = await import('../brasil/extractor.js');

function browser(url, cards = []) {
  let closed = false;
  return {
    wasClosed: () => closed,
    newPage: async () => ({
      setUserAgent: async () => {}, setViewport: async () => {},
      goto: async () => ({ ok: () => true }), url: () => url,
      waitForSelector: async () => { throw new Error('nao encontrado'); },
      $$: async () => cards, $: async () => null,
      evaluate: async (_fn, card) => card,
      close: async () => { closed = true; },
    }),
  };
}

test('Casa Nova seleciona paginacao por negociacao e interrompe em falha', async () => {
  for (const negociacao of ['venda', 'locacao']) {
    const url = `https://casanovajf.com.br/imoveis?negociacao=${negociacao}`;
    const b = browser(url);
    const rows = await extractCasaNovaData(b, [url], { negociacao, totalEsperado: 1, catalogos });
    assert.deepEqual(used, [negociacao, 1]);
    assert.equal(rows[0].cidade, 'cidade-teste-mg');
    assert.equal(rows[0].bairro, 'centro-gcs');
    assert.equal(rows[0].tipoImovel, 'casa-gcs');
    assert.equal(b.wasClosed(), true);
  }
  const b = browser('https://casanovajf.com.br/imoveis?negociacao=locacao');
  fail = true;
  try {
    await assert.rejects(extractCasaNovaData(b, ['https://casanovajf.com.br/imoveis?negociacao=locacao'], { negociacao: 'locacao', totalEsperado: 1, catalogos }), /incompleta/);
    assert.equal(b.wasClosed(), true);
  } finally { fail = false; }
});

test('Brasil valida contagem, usa catalogos e fecha pagina mesmo em coleta incompleta', async () => {
  const url = 'https://brasilimoveisjf.com.br/imoveis?negociacao=venda';
  const b = browser(url, [html]);
  const rows = await extractBrasilData(b, [url], { negociacao: 'venda', totalEsperado: 1, catalogos });
  assert.equal(rows[0].cidade, 'cidade-teste-mg');
  assert.equal(rows[0].bairro, 'centro-gcs');
  assert.equal(rows[0].tipoImovel, 'casa-gcs');
  assert.equal(b.wasClosed(), true);
  const incomplete = browser(url, [html]);
  await assert.rejects(extractBrasilData(incomplete, [url], { negociacao: 'venda', totalEsperado: 2, catalogos }), /ausente/);
  assert.equal(incomplete.wasClosed(), true);
});

test('Brasil avanca pelo botao ate a contagem esperada', async () => {
  const url = 'https://brasilimoveisjf.com.br/imoveis?negociacao=venda';
  const first = html;
  const second = html.replace('/imovel/casa--centro', '/imovel/outro--centro');
  let clicked = false;
  let closed = false;
  const page = {
    setUserAgent: async () => {}, setViewport: async () => {},
    goto: async () => ({ ok: () => true }), url: () => url,
    waitForSelector: async () => { throw new Error('nao encontrado'); },
    $$: async () => clicked ? [first, second] : [first],
    $: async () => ({ click: async () => { clicked = true; } }),
    waitForFunction: async () => { assert.equal(clicked, true); },
    evaluate: async (_fn, card) => card,
    close: async () => { closed = true; },
  };
  const rows = await extractBrasilData({ newPage: async () => page }, [url], { negociacao: 'venda', totalEsperado: 2, catalogos });
  assert.equal(rows.length, 2);
  assert.equal(clicked, true);
  assert.equal(closed, true);
});
