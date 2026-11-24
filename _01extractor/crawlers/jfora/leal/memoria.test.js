import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('749 cards Leal preservam os vinte campos com heap limitado a 256 MB e logs de progresso', () => {
  const pagination = new URL('../_utils/vendasKenloPaginacao.js', import.meta.url).href;
  const extractor = new URL('./extractor.js', import.meta.url).href;
  const code = `
    import { mock } from 'node:test';
    import assert from 'node:assert/strict';
    const cards = Array.from({ length: 749 }, (_, i) =>
      '<div class="card card-listing"><a href="https://www.lealimoveismb.com.br/imovel/AP' + i + '"><h3 class="card-text">Apartamento em Juiz de Fora</h3></a>' +
      '<h2 class="card-title">Centro</h2><span class="h-money location">R$ 300.000</span>' +
      '<div class="value"><p>2 quartos</p></div><small class="reference property_full_reference pull-right">AP' + i + '</small>' +
      '<img class="card-img-top" src="https://example.com/foto.jpg"></div>');
    mock.module(${JSON.stringify(pagination)}, { namedExports: {
      coletarPaginasKenloVendas: async () => cards, readSnapshotLeal: () => {},
    } });
    const { extractLocalData } = await import(${JSON.stringify(extractor)});
    const rows = await extractLocalData({ newPage: async () => { throw new Error('Bairro do card deve resolver'); } }, []);
    assert.equal(rows.length, 749);
    assert.equal(new Set(rows.map(r => r.linkReal)).size, 749);
    for (const r of rows) {
      assert.equal(Object.keys(r).length, 20);
      assert.equal(r.preco, 300000);
      assert.equal(r.cidade, 'juiz-de-fora-mg');
      assert.equal(r.bairro, 'centro');
      assert.equal(r.linkFoto, 'https://example.com/foto.jpg');
    }
    console.log('HEAP_MB', Math.round(process.memoryUsage().heapUsed / 1024 / 1024));
    const sample = cards[0].replace('<h2 class="card-title">Centro</h2>', '');
    cards.splice(0, cards.length, sample, sample.replaceAll('AP0', 'AP1'), sample.replaceAll('AP0', 'AP2'));
    let closed = 0, opened = 0;
    const detailBrowser = { newPage: async () => {
      const index = opened++;
      return {
        goto: async (_url, options) => {
          assert.equal(options.timeout, 45000);
          if (index === 2) throw new Error('Navigation timeout');
          return { ok: () => index === 0, status: () => index === 0 ? 200 : 503 };
        },
        content: async () => '<ol><li class="item-breadcrumb"><a>Juiz de Fora</a></li><li class="item-breadcrumb"><a>Centro</a></li></ol>',
        close: async () => { closed++; },
      };
    } };
    const details = await extractLocalData(detailBrowser, []);
    assert.equal(details[0].bairro, 'centro');
    assert.equal(details[1].bairro, '');
    assert.equal(details[2].bairro, '');
    assert.equal(closed, 3);
  `;
  const result = spawnSync(process.execPath, [
    '--max-old-space-size=256', '--experimental-test-module-mocks', '--input-type=module', '-e', code,
  ], { encoding: 'utf8', timeout: 120000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Campos extraidos: 25\/749/);
  assert.match(result.stdout, /Campos extraidos: 749\/749/);
  assert.match(result.stdout, /Breadcrumbs consultados: 3\/3; bairros resolvidos: 1/);
  assert.match(result.stderr, /HTTP 503/);
  assert.match(result.stderr, /Navigation timeout/);
});
