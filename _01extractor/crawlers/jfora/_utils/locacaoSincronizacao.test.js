import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mock, test } from 'node:test';
import { reconciliarLocacao, enriquecerLocacao } from './locacaoSincronizacao.js';
import { JF_SPREADSHEET_ID } from './jfSheetsConfig.js';

test('somente imoveis do site permanecem ativos; retirados mantem dados e imobiliaria', () => {
  const antigo = { linkReal: 'https://example.com/imovel/1', codigoBase: '1', titulo: 'Antigo', preco: 1000, dataInclusao: '2025-01-01', linkFoto: 'foto' };
  const ausente = { linkReal: 'https://example.com/imovel/2', codigoBase: '2', preco: 500, bairro: 'centro' };
  const novo = { ...antigo, titulo: 'Atual', preco: 1200, dataInclusao: '2026-10-04' };
  const result = reconciliarLocacao([novo], [antigo, ausente], 'jfTeste');
  assert.equal(result.ativos.length, 1);
  assert.equal(result.ativos[0].preco, 1200);
  assert.equal(result.ativos[0].titulo, 'Atual');
  assert.equal(result.ativos[0].dataInclusao, '2025-01-01');
  assert.equal(result.ativos[0].dataExclusao, '');
  assert.deepEqual(result.retirados[0], { ...ausente, imobiliaria: 'jfTeste', retiradaId: result.retirados[0].retiradaId });
  assert.equal(antigo.preco, 1000);
});

test('codigo identifica mesmo imovel com link alterado e preco null substitui valor antigo', () => {
  const result = reconciliarLocacao([{ linkReal: 'https://example.com/imovel/novo?from=rent', codigoBase: '1', preco: null }], [{ linkReal: 'https://example.com/imovel/antigo', codigoBase: '1', preco: 900 }], 'jfTeste');
  assert.equal(result.retirados.length, 0);
  assert.equal(result.ativos[0].preco, null);
  assert.equal(result.ativos[0].linkReal, 'https://example.com/imovel/novo?from=rent');
});

test('identidade por link preserva variantes e retira apenas o link ausente', () => {
  const a = { linkReal: 'https://example.com/a', codigoBase: '1', preco: 900, dataInclusao: 'antigo-a' };
  const b = { linkReal: 'https://example.com/b', codigoBase: '1', preco: 900, dataInclusao: 'antigo-b' };
  const result = reconciliarLocacao([a], [a, b], 'rioLuciene', { identificarPorLink: true, totalEsperado: 1 });
  assert.equal(result.ativos[0].dataInclusao, 'antigo-a');
  assert.deepEqual(result.retirados.map(item => item.linkReal), [b.linkReal]);
  assert.equal(reconciliarLocacao([a, b], [], 'rioLuciene', { identificarPorLink: true }).ativos.length, 2);
});

test('nao reaproveita campos obsoletos e retira inclusive soft deletes antigos', () => {
  const result = reconciliarLocacao([{ linkReal: 'https://example.com/1', preco: 0 }], [{ linkReal: 'https://example.com/1', preco: 500, localizacao: 'velha' }, { linkReal: 'https://example.com/2', preco: 600, dataExclusao: '2025-01-01' }], 'jfTeste');
  assert.equal(Object.hasOwn(result.ativos[0], 'localizacao'), false);
  assert.equal(result.retirados.length, 1);
  assert.equal(result.retirados[0].dataExclusao, '2025-01-01');
});

test('vazio so e aceito com confirmacao; coleta parcial e duplicada nao passa', () => {
  const old = [{ linkReal: 'https://example.com/1', preco: 900 }];
  assert.throws(() => reconciliarLocacao([], old, 'jfTeste'), /nao confirmada/);
  assert.equal(reconciliarLocacao([], old, 'jfTeste', { vazioConfirmado: true, totalEsperado: 0 }).retirados.length, 1);
  const current = [{ linkReal: 'https://example.com/1', preco: 900 }];
  assert.throws(() => reconciliarLocacao(current, old, 'jfTeste', { totalEsperado: 2 }), /incompleta/);
  assert.throws(() => reconciliarLocacao([...current, ...current], old, 'jfTeste'), /duplicados/);
});

const files = new Map();
test('enriquecimento atualiza endereco sem substituir aluguel por venda ou taxas', async () => {
  const imoveis = [{ preco: 900 }, { preco: null }];
  await enriquecerLocacao({}, imoveis, async (_browser, items) => {
    for (const item of items) { item.preco = 300000; item.localizacao = 'Endereco atualizado'; }
  });
  assert.equal(imoveis[0].preco, 900);
  assert.equal(imoveis[1].preco, null);
  assert.equal(imoveis[0].localizacao, 'Endereco atualizado');
});
const calls = [];
let sheetRows = [];
let archiveFailure = false;
mock.module('node:fs', { defaultExport: { ...fs, existsSync: file => files.has(file), readFileSync: file => files.get(file), mkdirSync: () => {}, writeFileSync: (file, data) => { files.set(file, data); calls.push(['json', file]); } } });
mock.module('../../../services/googleSheets.js', { namedExports: {
  ensureSheet: async (id, title) => { calls.push(['ensure', id, title]); return title; },
  readSheet: async () => sheetRows,
  writeHeader: async (_id, _title, header) => { sheetRows = [header]; },
  appendRows: async (_id, _range, rows, options) => { calls.push(['archive', options]); if (archiveFailure) throw new Error('Arquivo Sheets indisponivel'); sheetRows.push(...rows); },
} });
const { sincronizarLocacao } = await import('./locacaoSincronizacao.js');

test('arquiva separadamente variantes removidas do mesmo codigo quando a identidade e o link', async () => {
  files.clear();
  calls.length = 0;
  sheetRows = [];
  const old = [
    { linkReal: 'https://example.com/a', codigoBase: '1', preco: 900, dataExclusao: '2026-01-01' },
    { linkReal: 'https://example.com/b', codigoBase: '1', preco: 950, dataExclusao: '2026-01-01' },
  ];
  await sincronizarLocacao({
    imoveis: [], anteriores: old, imobiliaria: 'rioLuciene', outputPath: 'C:/teste/rioLucieneLocacao.json',
    exportToSheets: async () => {}, vazioConfirmado: true, totalEsperado: 0, identificarPorLink: true,
  });
  assert.equal(sheetRows.length, 3);
  assert.deepEqual(sheetRows.slice(1).map(row => row[0]), old.map(item => item.linkReal));
});

test('arquiva todos os campos mais imobiliaria antes de substituir ativos, sem duplicar em retry', async () => {
  calls.length = 0;
  files.clear();
  sheetRows = [];
  const old = [{ linkReal: 'https://example.com/1', codigoBase: '1', preco: 900, bairro: 'centro' }];
  const outputPath = 'C:/teste/jfTesteLocacao.json';
  const exportToSheets = async data => { calls.push(['active', data.size]); };
  archiveFailure = true;
  try {
    await assert.rejects(sincronizarLocacao({ imoveis: [], anteriores: old, imobiliaria: 'jfTeste', outputPath, exportToSheets, vazioConfirmado: true }), /indisponivel/);
    assert.equal(files.has(outputPath), false);
    assert.ok(!calls.some(([name]) => name === 'active'));
  } finally { archiveFailure = false; }
  await sincronizarLocacao({ imoveis: [], anteriores: old, imobiliaria: 'jfTeste', outputPath, exportToSheets, vazioConfirmado: true });
  assert.equal(sheetRows.length, 2);
  assert.equal(sheetRows[0].length, 21);
  assert.equal(sheetRows[1][2], 900);
  assert.equal(sheetRows[1][5], 'centro');
  assert.equal(sheetRows[1][20], 'jfTeste');
  assert.equal(files.get(outputPath), '[]');
  assert.ok(calls.findIndex(([name]) => name === 'archive') < calls.findIndex(([name]) => name === 'active'));
  await sincronizarLocacao({ imoveis: [], anteriores: [], imobiliaria: 'jfTeste', outputPath, exportToSheets, vazioConfirmado: true });
  assert.equal(sheetRows.length, 2);
});

test('falha na publicacao principal mantem JSON anterior e retry atualiza preco sem duplicar retirados', async () => {
  files.clear();
  calls.length = 0;
  sheetRows = [];
  const old = [{ linkReal: 'https://example.com/1', codigoBase: '1', preco: 900 }, { linkReal: 'https://example.com/2', codigoBase: '2', preco: 500 }];
  const current = [{ linkReal: 'https://example.com/1', codigoBase: '1', preco: 1200 }];
  const outputPath = 'C:/teste/jfTesteLocacao.json';
  const before = JSON.stringify(old);
  files.set(outputPath, before);
  const options = { imoveis: current, anteriores: old, imobiliaria: 'jfTeste', outputPath, totalEsperado: 1 };
  await assert.rejects(sincronizarLocacao({ ...options, exportToSheets: async () => { throw new Error('Ativos indisponiveis'); } }), /Ativos indisponiveis/);
  assert.equal(files.get(outputPath), before);
  assert.equal(sheetRows.length, 2);
  let published;
  let exportOptions;
  await sincronizarLocacao({ ...options, exportToSheets: async (data, options) => { published = Array.from(data.values()); exportOptions = options; } });
  const saved = JSON.parse(files.get(outputPath));
  assert.deepEqual(saved, published);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].preco, 1200);
  assert.equal(sheetRows.length, 2);
  assert.deepEqual(exportOptions, { spreadsheetId: JF_SPREADSHEET_ID, sheetName: 'jfTeste', negociacao: 'aluguel' });
  assert.ok(calls.some(call => call[0] === 'ensure' && call[1] === JF_SPREADSHEET_ID && call[2] === 'retiradosLocacao'));
});