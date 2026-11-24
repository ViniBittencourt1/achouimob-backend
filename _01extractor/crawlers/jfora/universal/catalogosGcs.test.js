import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mock, test } from 'node:test';
import { extractUniversalData } from './extractor.js';

test('coleta usa catalogos fornecidos sem ler catalogos locais, inclusive aliases de bairro', async () => {
  const url = 'https://universalimoveis.com.br/imoveis?negociacao=venda';
  const html = `<span id="title--label">(1)</span><div class="imovel-item">
    <a href="/imovel/123">Anuncio</a>
    <div class="imovel-item--localizacao">Bairro Jardim Teste, Cidade Teste</div>
    <div class="imovel-item--tipo"><span>Casa</span></div>
  </div>`;
  const page = {
    setUserAgent: async () => {}, setViewport: async () => {}, goto: async () => {},
    waitForSelector: async () => { throw new Error('Sem LGPD'); },
    url: () => url, content: async () => html, close: async () => {},
  };
  const catalogos = {
    cidades: [{ nome: 'Cidade Teste', slug: 'cidade-gcs' }],
    bairros: [
      { nome: 'Vizinho', slug: 'vizinho', principal: 'sim' },
      { nome: 'Condominio Jardim Teste', slug: 'bairro-gcs', principal: 'nao' },
    ],
    tipos: { grupos: [{ nome: 'Casa', slug: 'tipo-gcs' }] },
  };
  const read = fs.readFileSync.bind(fs);
  const guarded = mock.method(fs, 'readFileSync', (file, ...args) => {
    if (/_brCidades\.json|_jfBairros\.json|_brTipoImovel\.json/i.test(String(file))) {
      throw new Error('Catalogo local nao deve ser consultado');
    }
    return read(file, ...args);
  });
  try {
    const result = await extractUniversalData({ newPage: async () => page }, [url], { totalEsperado: 1, catalogos });
    assert.equal(result[0].cidade, 'cidade-gcs');
    assert.equal(result[0].bairro, 'bairro-gcs');
    assert.equal(result[0].tipoImovel, 'tipo-gcs');
  } finally { guarded.mock.restore(); }
});
