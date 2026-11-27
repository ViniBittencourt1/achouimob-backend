import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const html = '<div class="imovel-item"><a href="/imovel/1"></a><div class="imovel-item--localizacao">Centro, Cidade Teste</div><div class="imovel-item--tipo"><span>Casa</span></div></div>';
let used;
let fail = false;
mock.module(new URL('../_utils/vendasPadraoPaginacao.js', import.meta.url), {
  namedExports: { coletarVendasPadrao: async (_page, _url, total) => { used = ['venda', total]; if (fail) throw new Error('incompleta'); return [html]; } },
});
mock.module(new URL('../_utils/locacaoPadraoPaginacao.js', import.meta.url), {
  namedExports: { coletarLocacaoPadrao: async (_page, _url, total) => { used = ['locacao', total]; if (fail) throw new Error('incompleta'); return [html]; } },
});
const { extractBargonData } = await import('./extractor.js');
const catalogos = {
  cidades: [{ nome: 'Cidade Teste', slug: 'cidade-teste-mg', estado: 'MG' }],
  bairros: [{ nome: 'Centro', slug: 'centro-gcs', cidade: 'cidade-teste-mg' }],
  tipos: [{ nome: 'Casa', slug: 'casa-gcs' }],
};
function browser() {
  let closed = false;
  return {
    wasClosed: () => closed,
    newPage: async () => ({
      setUserAgent: async () => {}, setViewport: async () => {},
      goto: async () => ({ ok: () => true }),
      waitForSelector: async () => { throw new Error('nao encontrado'); },
      close: async () => { closed = true; },
    }),
  };
}
test('extrator Bargon seleciona paginacao e catalogos do snapshot', async () => {
  for (const negociacao of ['venda', 'locacao']) {
    const b = browser();
    const rows = await extractBargonData(b, [`https://bargonimoveis.com.br/imoveis?negociacao=${negociacao}`], { negociacao, totalEsperado: 1, catalogos });
    assert.deepEqual(used, [negociacao, 1]);
    assert.equal(rows[0].cidade, 'cidade-teste-mg');
    assert.equal(rows[0].bairro, 'centro-gcs');
    assert.equal(rows[0].tipoImovel, 'casa-gcs');
    assert.equal(b.wasClosed(), true);
  }
});
test('falha na paginacao interrompe a coleta e fecha a pagina', async () => {
  const b = browser();
  fail = true;
  try {
    await assert.rejects(extractBargonData(b, ['https://bargonimoveis.com.br/imoveis?negociacao=locacao'], { negociacao: 'locacao', totalEsperado: 1, catalogos }), /incompleta/);
    assert.equal(b.wasClosed(), true);
  } finally { fail = false; }
});
