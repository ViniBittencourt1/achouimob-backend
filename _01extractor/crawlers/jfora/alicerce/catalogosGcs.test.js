import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { extractTipoImovel } from './extractor-05-tipoImovel.js';
import { extractBairro } from './extractor-06-bairrojs.js';
import { extractCidadeFromCardHtml } from './extractor-07-cidade.js';

test('Alicerce usa os catalogos recebidos sem ler arquivos locais', t => {
  t.mock.method(fs, 'readFileSync', () => { throw new Error('Leitura local indevida'); });
  const html = '<div class="imovel-item--localizacao">Centro, Cidade Teste</div><div class="imovel-item--tipo"><span>Casa</span></div>';
  const tipos = { tipos: [{ nome: 'Casa', slug: 'casa-gcs' }] };
  const cidades = [{ nome: 'Cidade Teste', slug: 'cidade-gcs' }];
  const bairros = [{ nome: 'Centro', slug: 'centro-gcs', cidade: 'cidade-gcs', principal: 'sim' }];
  assert.equal(extractTipoImovel(html, tipos), 'casa-gcs');
  assert.equal(extractCidadeFromCardHtml(html, 'https://alicerceimob.com.br/imovel/cidade-teste', cidades), 'cidade-gcs');
  assert.equal(extractBairro(html, 'cidade-gcs', bairros), 'centro-gcs');
});
