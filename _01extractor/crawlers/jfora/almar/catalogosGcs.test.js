import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { extractTipoImovel } from './extractor-05-tipoImovel.js';
import { extractBairro } from './extractor-06-bairrojs.js';
import { extractCidadeFromCardHtml } from './extractor-07-cidade.js';

test('Almar usa somente os catalogos recebidos, inclusive no fallback do link', t => {
  new JSDOM('<div></div>').window.close();
  t.mock.method(fs, 'readFileSync', () => { throw new Error('Leitura local indevida'); });
  const html = '<div class="imovel-item--localizacao">Centro, Cidade Teste</div><div class="imovel-item--tipo"><span>Casa</span></div>';
  const tipos = { tipos: [{ nome: 'Casa', slug: 'casa-gcs' }] };
  const cidades = [{ nome: 'Cidade Teste', slug: 'cidade-teste' }];
  const bairros = [{ nome: 'Centro', slug: 'centro-gcs', cidade: 'cidade-teste', principal: 'sim' }];
  const link = 'https://grupoalmar.com.br/imovel/casa--centro--cidade_teste--mg--1';
  assert.equal(extractTipoImovel(html, tipos), 'casa-gcs');
  assert.equal(extractCidadeFromCardHtml(html, link, cidades), 'cidade-teste');
  assert.equal(extractBairro(html, 'cidade-teste', link, bairros), 'centro-gcs');
  assert.equal(extractBairro('<div></div>', 'cidade-teste', link, bairros), 'centro-gcs');
});
