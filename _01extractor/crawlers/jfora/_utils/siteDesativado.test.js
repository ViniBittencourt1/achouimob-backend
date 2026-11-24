import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { retirarImoveisSiteDesativado, verificarSiteDesativado, lerSiteDesativadoDOM } from './siteDesativado.js';
import { CABECALHO_IMOVEIS_SHEETS, mesclarLinhasSheets } from './imoveisSheets.js';
import { CABECALHO_RETIRADOS_VENDAS, arquivoPrincipalImoveis } from './vendasSincronizacao.js';
import { linhaSheets } from './sheetsCampos.js';

const now = new Date('2026-11-01T15:43:08Z');
const record = (link, negociacao) => ({
  linkReal: `https://example.com/imovel/${link}`, codigoBase: link, titulo: 'Apartamento',
  preco: negociacao === 'venda' ? 500000 : 1500, negociacao,
  atualizadoEm: '31/10/2026 10:00:00', dataInclusao: '2026-10-01T12:00:00Z', dataExclusao: '',
});

function fixture(t, projeto = 'nitTeste') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'site-desativado-'));
  t.after(() => fs.rmSync(directory, { recursive: true }));
  const sale = record('1', 'venda');
  const rental = record('1', 'aluguel');
  const sheetsOnly = record('2', 'aluguel');
  const files = [`${projeto}.json`, `${projeto}Locacao.json`];
  files.forEach((file, index) => fs.writeFileSync(path.join(directory, file), JSON.stringify([index ? rental : sale])));
  const tabs = new Map([[projeto, [[...CABECALHO_IMOVEIS_SHEETS], ...[sale, rental, sheetsOnly].map(item => [...linhaSheets(item), item.negociacao])]]]);
  let fail = false;
  const titleFor = range => /^'([^']+)'!/.exec(range)[1];
  const api = {
    ensureSheet: async (_id, title) => { if (!tabs.has(title)) tabs.set(title, []); return title; },
    readSheet: async (_id, range) => structuredClone(tabs.get(titleFor(range))),
    writeHeader: async (_id, title, header) => { tabs.get(title)[0] = header; },
    appendRows: async (_id, range, rows) => {
      if (fail) throw new Error('Sheets indisponivel');
      tabs.get(titleFor(range)).push(...rows);
    },
    clearSheet: async (_id, title) => { tabs.set(title, []); },
    writeSheet: async (_id, range, rows) => { tabs.get(titleFor(range)).push(...rows); },
  };
  return {
    directory, tabs, files, sale, rental, sheetsOnly, api,
    options: { directory, adapter: api, spreadsheetId: 'test', now },
    setFail: value => { fail = value; },
    read: file => JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')),
  };
}

for (const projeto of ['jfTeste', 'nitTeste']) {
  test(`${projeto}: arquiva vendas e alugueis e deixa somente aviso fora dos JSONs publicaveis`, async t => {
    const f = fixture(t, projeto);
    const result = await retirarImoveisSiteDesativado(projeto, f.options);
    assert.equal(result.retirados.length, 3);
    f.files.forEach(file => assert.deepEqual(f.read(file), []));
    const archived = f.tabs.get('retirados');
    assert.deepEqual(archived[0], CABECALHO_RETIRADOS_VENDAS);
    assert.equal(archived.length, 4);
    assert.ok(archived.slice(1).every(row => row[22] === 'Erro no site'));
    assert.deepEqual(archived.slice(1).map(row => row[19]), Array(3).fill('31/10/2026 10:00:00'));
    const warning = f.tabs.get(projeto);
    assert.equal(warning.length, 2);
    assert.equal(warning[1][19], '01/11/2026 12:43:08');
    assert.equal(warning[1][20], 'Erro no site');
    assert.equal(warning[1][0], '');
    const historyName = `${projeto}RetiradosErroSite.json`;
    assert.equal(arquivoPrincipalImoveis(historyName), false);
    assert.equal(f.read(historyName).length, 3);
    await retirarImoveisSiteDesativado(projeto, f.options);
    assert.equal(f.tabs.get('retirados').length, 4);
    assert.equal(f.tabs.get(projeto).length, 2);
  });
}

test('falha no Sheets nao mantem anuncios publicaveis; historico permite repetir sem perda', async t => {
  const f = fixture(t);
  f.setFail(true);
  await assert.rejects(retirarImoveisSiteDesativado('nitTeste', f.options), /Sheets indisponivel/);
  f.files.forEach(file => assert.deepEqual(f.read(file), []));
  assert.equal(f.read('nitTesteRetiradosErroSite.json').length, 3);
  f.setFail(false);
  await retirarImoveisSiteDesativado('nitTeste', f.options);
  assert.equal(f.tabs.get('retirados').length, 4);
  assert.equal(f.tabs.get('nitTeste')[1][20], 'Erro no site');
});

test('falha ao acessar o Sheets tambem remove JSONs ativos e permite recuperar o arquivo', async t => {
  const f = fixture(t);
  const read = f.api.readSheet;
  f.api.readSheet = async () => { throw new Error('Falha ao ler Sheets'); };
  await assert.rejects(retirarImoveisSiteDesativado('nitTeste', f.options), /Falha ao ler Sheets/);
  f.files.forEach(file => assert.deepEqual(f.read(file), []));
  assert.equal(f.read('nitTesteRetiradosErroSite.json').length, 2);
  f.api.readSheet = read;
  await retirarImoveisSiteDesativado('nitTeste', f.options);
  assert.equal(f.tabs.get('retirados').length, 4);
  assert.equal(f.read('nitTesteRetiradosErroSite.json').length, 3);
});

test('retomada de vendas ou alugueis remove aviso sem bloquear exportacao', async t => {
  const f = fixture(t);
  await retirarImoveisSiteDesativado('nitTeste', f.options);
  for (const negociacao of ['venda', 'aluguel']) {
    const merged = mesclarLinhasSheets([linhaSheets(record('3', negociacao))], f.tabs.get('nitTeste'), negociacao);
    assert.equal(merged.length, 1);
    assert.equal(merged[0][20], negociacao);
  }
});

test('JSON invalido impede retirada antes de apagar dados', async t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.directory, f.files[1]), '{}');
  await assert.rejects(retirarImoveisSiteDesativado('nitTeste', f.options), /JSON.*invalido/);
  assert.equal(f.read(f.files[0]).length, 1);
  assert.equal(f.tabs.get('nitTeste').length, 4);
});

test('cabecalho invalido no Sheets nao e sobrescrito e anuncios ficam fora dos JSONs', async t => {
  const f = fixture(t);
  f.tabs.set('nitTeste', [['cabecalho errado']]);
  await assert.rejects(retirarImoveisSiteDesativado('nitTeste', f.options), /Cabecalho.*incompativel/);
  f.files.forEach(file => assert.deepEqual(f.read(file), []));
  assert.deepEqual(f.tabs.get('nitTeste'), [['cabecalho errado']]);
  assert.equal(f.read('nitTesteRetiradosErroSite.json').length, 2);
});

test('somente mensagem explicita de desativacao aciona retirada; check nao grava', async () => {
  const dom = new JSDOM('<p>Este site est&aacute; temporariamente desativado.</p>');
  const previous = globalThis.document;
  globalThis.document = dom.window.document;
  try {
    assert.equal(lerSiteDesativadoDOM(), true);
    await assert.rejects(verificarSiteDesativado({ evaluate: async callback => callback() }, 'nitTeste', { salvar: false }),
      error => error.code === 'IMOBBRASIL_UNAVAILABLE');
    for (const text of ['HTTP 520', '403 Forbidden', 'Navigation timeout', 'Carregando...', '0 imoveis encontrados']) {
      dom.window.document.body.textContent = text;
      assert.equal(lerSiteDesativadoDOM(), false);
      await verificarSiteDesativado({ evaluate: async callback => callback() }, 'nitTeste', { salvar: false });
    }
  } finally {
    dom.window.close();
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});
