import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { extractTipoImovel } from './extractor-05-tipoImovel.js';
import { extractBairro } from './extractor-06-bairrojs.js';
import { extractCidadeFromCardHtml } from './extractor-07-cidade.js';

test('Bargon usa catalogos GCS, inclusive ao resolver cidade pelo link', t => {
  new JSDOM('<div></div>').window.close();
  t.mock.method(fs, 'readFileSync', () => { throw new Error('Leitura local indevida'); });
  const html = '<div class="imovel-item--localizacao">Centro, Cidade Teste</div><div class="imovel-item--tipo"><span>Casa</span></div>';
  const tipos = { tipos: [{ nome: 'Casa', slug: 'casa-gcs' }] };
  const cidades = [{ nome: 'Cidade Teste', slug: 'cidade-teste-mg', estado: 'MG' }];
  const bairros = [{ nome: 'Centro', slug: 'centro-gcs', cidade: 'cidade-teste-mg', principal: 'sim' }];
  const link = 'https://bargonimoveis.com.br/imovel/casa--centro--cidade_teste--mg--venda';
  assert.equal(extractTipoImovel(html, tipos), 'casa-gcs');
  assert.equal(extractCidadeFromCardHtml(html, link, cidades), 'cidade-teste-mg');
  assert.equal(extractBairro(html, 'cidade-teste-mg', link, bairros), 'centro-gcs');
});
