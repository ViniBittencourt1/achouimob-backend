import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { separarVendas, salvarHistoricoVendas, publicarRetiradosVendas, reconciliarVendas, sincronizarVendas, arquivoPrincipalVendas, arquivoPrincipalLocacao, arquivoPrincipalImoveis, CABECALHO_RETIRADOS_VENDAS, COLUNAS_VENDAS } from './vendasSincronizacao.js';
import { migrarRetiradosVendas } from '../../../../migrar-retirados-vendas.js';

test('vendas com identidade por link preservam variantes e retiram somente a versao ausente', () => {
  const a = { linkReal: 'https://example.com/a', codigoBase: '1', dataInclusao: 'antigo-a' };
  const b = { linkReal: 'https://example.com/b', codigoBase: '1', dataInclusao: 'antigo-b' };
  const result = reconciliarVendas([a], [a, b], [a], 'rioLuciene', { identificarPorLink: true, totalEsperado: 1 });
  assert.equal(result.ativos[0].dataInclusao, 'antigo-a');
  assert.deepEqual(result.retirados.map(item => item.linkReal), [b.linkReal]);
  assert.equal(reconciliarVendas([a, b], [], [a, b], 'rioLuciene', { identificarPorLink: true }).ativos.length, 2);
});

test('todos os 57 orquestradores usam fluxo unico com variaveis no escopo e sem gravacao antecipada', () => {
  const require = createRequire(import.meta.url);
  const { parse } = require('@babel/parser');
  const traverse = require('@babel/traverse').default;
  const root = fileURLToPath(new URL('../', import.meta.url));
  let checked = 0;
  for (const folder of fs.readdirSync(root)) {
    const file = path.join(root, folder, 'index.js');
    if (!fs.existsSync(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    if (!/(?:const|let)\s+COLLECTION_NAME\s*=/.test(source)) continue;
    let synchronizations = 0;
    traverse(parse(source, { sourceType: 'module' }), {
      CallExpression(call) {
        const { node } = call;
        assert.notEqual(node.callee.name, 'batchUpdateFromMap', folder);
        if (node.callee.object?.name === 'fs') assert.notEqual(node.callee.property?.name, 'writeFileSync', folder);
        if (node.callee.name !== 'sincronizarVendas') return;
        synchronizations++;
        for (const property of node.arguments[0].properties) {
          if (property.value.type === 'Identifier') assert.ok(call.scope.getBinding(property.value.name), `${folder}: ${property.value.name} fora de escopo`);
        }
      },
    });
    assert.equal(synchronizations, 1, folder);
    checked++;
  }
  assert.equal(checked, 57);
});

test('bases principais de vendas nao incluem aluguel nem historico de retirados', () => {
  assert.equal(arquivoPrincipalVendas('jfTeste.json'), true);
  assert.equal(arquivoPrincipalVendas('nitAccioly.json'), true);
  assert.equal(arquivoPrincipalVendas('ubaJXavier.json'), true);
  assert.equal(arquivoPrincipalVendas('ubaJXavierLocacao.json'), false);
  assert.equal(arquivoPrincipalVendas('jfTesteLocacao.json'), false);
  assert.equal(arquivoPrincipalVendas('jfTesteRetiradosVendas.json'), false);
  assert.equal(arquivoPrincipalVendas('jfTesteRetiradosLocacao.json'), false);
  assert.equal(arquivoPrincipalVendas('../jfTeste.json'), false);
  const { publicationArguments } = createRequire(import.meta.url)('../../../../publication-profiles.cjs');
  assert.throws(() => publicationArguments(['--tipo=vendas', 'jfTesteRetiradosVendas']), /sem sufixo/);
});

test('checagens do painel cobrem bases ativas de venda e aluguel, sem retirados', () => {
  assert.equal(arquivoPrincipalImoveis('jfTeste.json'), true);
  assert.equal(arquivoPrincipalImoveis('nitNovaLocacao.json'), true);
  assert.equal(arquivoPrincipalImoveis('ubaGb.json'), true);
  assert.equal(arquivoPrincipalLocacao('ubaGbLocacao.json'), true);
  assert.equal(arquivoPrincipalImoveis('ubaGbRetiradosVendas.json'), false);
  assert.equal(arquivoPrincipalImoveis('ubaGbRetiradosLocacao.json'), false);
  assert.equal(arquivoPrincipalLocacao('nitNovaLocacao.json'), true);
  assert.equal(arquivoPrincipalLocacao('nitNova.json'), false);
  assert.equal(arquivoPrincipalImoveis('jfTesteRetiradosLocacao.json'), false);
  assert.equal(arquivoPrincipalImoveis('jfTesteRetiradosVendas.json'), false);
  assert.equal(arquivoPrincipalImoveis('../nitNovaLocacao.json'), false);
});

test('separa excluidos de vendas preservando dados completos, imobiliaria e identificacao repetivel', () => {
  const active = { linkReal: 'https://example.com/1', preco: 100, dataExclusao: '' };
  const removed = { linkReal: 'https://example.com/2', codigoBase: '2', preco: 200, dataExclusao: '2026-10-01', campoExtra: { valor: 3 } };
  const result = separarVendas([active, removed], 'jfTeste');
  assert.deepEqual(result.ativos, [active]);
  assert.equal(result.retirados[0].imobiliaria, 'jfTeste');
  assert.deepEqual(result.retirados[0].campoExtra, removed.campoExtra);
  assert.equal(result.retirados[0].dataExclusao, removed.dataExclusao);
  assert.equal(result.retirados[0].retiradaId, separarVendas([removed], 'jfTeste').retirados[0].retiradaId);
  const reordered = Object.fromEntries(Object.entries(removed).reverse());
  assert.equal(result.retirados[0].retiradaId, separarVendas([reordered], 'jfTeste').retirados[0].retiradaId);
  assert.equal(result.retirados[0].retiradaId, separarVendas([{ ...removed, dataExclusao: '2026-10-02' }], 'jfTeste').retirados[0].retiradaId);
  assert.notEqual(result.retirados[0].retiradaId, separarVendas([removed], 'jfOutra').retirados[0].retiradaId);
  assert.equal(removed.imobiliaria, undefined);
});

test('nao confunde dataExclusao zero com exclusao e rejeita arquivos de aluguel', () => {
  assert.equal(separarVendas([{ codigoBase: 'LEGADO', dataExclusao: '2026-01-01' }], 'jfTeste').retirados[0].codigoBase, 'LEGADO');
  assert.equal(separarVendas([{ linkReal: 'https://example.com/1', dataExclusao: 0 }], 'jfTeste').ativos.length, 1);
  assert.equal(separarVendas([{ linkReal: 'https://example.com/1', ativo: false }], 'jfTeste').retirados.length, 1);
  assert.throws(() => separarVendas([], 'jfTesteLocacao'), /vendas/);
  assert.throws(() => separarVendas([null], 'jfTeste'), /base preservada/);
});

test('sincronizacao e leituras do painel aceitam bases ativas Uba sem historicos', () => {
  const result = separarVendas([{ linkReal: 'https://www.jxavier.com.br/detail?id=1', dataExclusao: '' }], 'ubaJXavier');
  assert.equal(result.ativos.length, 1);
  assert.equal(arquivoPrincipalVendas('ubaJXavier.json'), true);
  assert.equal(arquivoPrincipalVendas('ubaJXavierRetiradosVendas.json'), false);
  assert.throws(() => separarVendas([], 'ubaJXavierLocacao'), /vendas/);
});

test('historico e envio de vendas sao completos, verificaveis e idempotentes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vendas-retirados-'));
  try {
    const outputPath = path.join(root, 'jfTeste.json');
    const removed = separarVendas([{ linkReal: 'https://example.com/2', dataExclusao: '2026-10-01', duplicado_grupo: 'grupo-1' }], 'jfTeste').retirados;
    const rows = [];
    const api = {
      ensureSheet: async (id, title, columns) => { assert.equal(id, 'vendas'); assert.equal(columns, 23); return title; },
      readSheet: async (_id, range) => range.endsWith('V:V') ? rows.map(row => [row[21]]) : rows,
      writeHeader: async (_id, _title, header) => rows.push(header),
      appendRows: async (_id, _range, added, options) => { assert.equal(options.insertDataOption, 'OVERWRITE'); rows.push(...added); },
    };
    assert.equal(salvarHistoricoVendas(outputPath, removed).length, 1);
    assert.equal(salvarHistoricoVendas(outputPath, removed).length, 1);
    assert.equal((await publicarRetiradosVendas(removed, 'vendas', api)).enviados, 1);
    assert.deepEqual(rows[0], CABECALHO_RETIRADOS_VENDAS);
    assert.equal(JSON.parse(rows[1][22]).duplicado_grupo, 'grupo-1');
    assert.equal((await publicarRetiradosVendas(removed, 'vendas', api)).enviados, 0);
    assert.equal(fs.existsSync(outputPath), false);
    await assert.rejects(publicarRetiradosVendas(removed, 'vendas', { ...api, readSheet: async () => [] }), /nao confirmado/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('migracao arquiva primeiro e so depois limpa vendas, preservando aluguel e ativos', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'migrar-vendas-'));
  try {
    fs.mkdirSync(path.join(root, 'crawler'));
    const active = { linkReal: 'https://example.com/1', preco: 500, dataExclusao: '' };
    const removed = { linkReal: 'https://example.com/2', preco: 600, dataExclusao: '2026-10-01', extra: 'preservar' };
    fs.writeFileSync(path.join(root, 'crawler/jfTeste.json'), JSON.stringify([active, removed]));
    fs.writeFileSync(path.join(root, 'crawler/jfTesteLocacao.json'), '[]');
    const archiveRows = [];
    let principalRows = [COLUNAS_VENDAS, ...[{ ...active, preco: 450 }, removed].map(item => COLUNAS_VENDAS.map(key => item[key] ?? ''))];
    let failArchive = true;
    const api = {
      getSheetsMetadata: async () => [{ title: 'jfTeste', gridProperties: { rowCount: 1000, columnCount: 20 } }],
      readSheets: async () => [{ values: principalRows.map(row => [...row]) }],
      ensureSheet: async () => 'retirados',
      readSheet: async () => archiveRows,
      writeHeader: async (_id, _title, header) => archiveRows.push(header),
      appendRows: async (_id, _range, rows) => { if (failArchive) throw new Error('Arquivo indisponivel'); archiveRows.push(...rows); },
      writeSheet: async (_id, _range, rows) => { assert.ok(archiveRows.length > 1); principalRows.splice(0, rows.length, ...rows); },
      clearSheetsRanges: async () => { principalRows.length = 2; },
    };
    await assert.rejects(migrarRetiradosVendas({ root, spreadsheetId: 'vendas', aplicar: true, adapter: api }), /Arquivo indisponivel/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'crawler/jfTeste.json'))).length, 2);
    assert.equal(principalRows.length, 3);
    failArchive = false;
    const result = await migrarRetiradosVendas({ root, spreadsheetId: 'vendas', aplicar: true, adapter: api });
    assert.equal(result.concluida, true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'crawler/jfTeste.json'))).length, 1);
    assert.equal(principalRows[1][2], 450);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'crawler/jfTeste.json')))[0].preco, 500);
    assert.equal(fs.readFileSync(path.join(root, 'crawler/jfTesteLocacao.json'), 'utf8'), '[]');
    assert.equal(JSON.parse(fs.readFileSync(path.join(result.backupDirectory, 'jfTeste.json'))).length, 2);
    assert.equal((await migrarRetiradosVendas({ root, spreadsheetId: 'vendas', aplicar: true, adapter: api })).versoesParaArquivar, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('nova raspagem mantem so atuais e preco atual, preserva inclusao e arquiva ausentes completos', () => {
  const previous = [
    { linkReal: 'https://example.com/1?antigo', codigoBase: '1', preco: 100, dataInclusao: '2020-01-01' },
    { linkReal: 'https://example.com/2', codigoBase: '2', preco: 200, campoExtra: 'preservar' },
  ];
  const current = [{ linkReal: 'https://example.com/1?novo', codigoBase: '1', preco: 300 }];
  const consolidated = [current[0], { ...previous[1], dataExclusao: '2026-10-05' }];
  const result = reconciliarVendas(current, previous, consolidated, 'jfTeste');
  assert.equal(result.ativos.length, 1);
  assert.equal(result.ativos[0].preco, 300);
  assert.equal(result.ativos[0].dataInclusao, '2020-01-01');
  assert.equal(result.retirados.length, 1);
  assert.equal(result.retirados[0].campoExtra, 'preservar');
  assert.throws(() => reconciliarVendas([], previous, consolidated, 'jfTeste'), /vazia/);
  assert.throws(() => reconciliarVendas(current, previous, previous, 'jfTeste'), /parcial/);
  assert.throws(() => reconciliarVendas(current, previous, consolidated, 'jfTeste', { totalEsperado: 2 }), /incompleta/);
});

test('codigo Nenhum e ausente: preserva identidade por link e datas sem retirar ativos', () => {
  const previous = [
    { linkReal: 'https://example.com/1', codigoBase: 'Nenhum', preco: 100, dataInclusao: '2020-01-01' },
    { linkReal: 'https://example.com/2', codigoBase: ' nenhum ', preco: 200, dataInclusao: '2021-01-01' },
  ];
  const current = previous.map(item => ({ ...item, codigoBase: '', dataInclusao: '2026-10-07' }));
  const result = reconciliarVendas(current, previous, current, 'jfSouzaRocha', { totalEsperado: 2 });
  assert.equal(result.ativos.length, 2);
  assert.equal(result.retirados.length, 0);
  assert.deepEqual(result.ativos.map(item => item.dataInclusao), ['2020-01-01', '2021-01-01']);
  const duplicated = current.map(item => ({ ...item, codigoBase: 'RH123' }));
  assert.throws(() => reconciliarVendas(duplicated, previous, duplicated, 'jfSouzaRocha'), /duplicadas/);
  const porLink = reconciliarVendas(duplicated, previous, duplicated, 'jfFluxo', { codigoRepetidoPorLink: true });
  assert.equal(porLink.ativos.length, 2);
  assert.equal(porLink.retirados.length, 0);
});

test('sincronizacao nova arquiva antes de exportar e falha preserva principal', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-vendas-'));
  try {
    const outputPath = path.join(root, 'crawler/jfTeste.json');
    fs.mkdirSync(path.dirname(outputPath));
    const previous = [{ linkReal: 'https://example.com/1', preco: 100 }, { linkReal: 'https://example.com/2', preco: 200 }];
    const original = JSON.stringify(previous);
    fs.writeFileSync(outputPath, original);
    const current = [{ linkReal: 'https://example.com/1', preco: 300 }];
    const archive = [];
    const api = { ensureSheet: async () => 'retirados', readSheet: async () => archive, writeHeader: async (_id, _title, header) => archive.push(header), appendRows: async (_id, _range, rows) => archive.push(...rows) };
    const options = { outputPath, imoveisRaspados: current, consolidados: [current[0], { ...previous[1], dataExclusao: '2026-10-05' }], imobiliaria: 'jfTeste', spreadsheetId: 'vendas', adapter: api };
    await assert.rejects(sincronizarVendas({ ...options, exportToSheets: async () => { assert.ok(archive.length > 1); throw new Error('Sheets indisponivel'); } }), /Sheets indisponivel/);
    assert.equal(fs.readFileSync(outputPath, 'utf8'), original);
    const result = await sincronizarVendas({ ...options, exportToSheets: async (data, params) => { assert.equal(data.size, 1); assert.equal(params.sheetName, 'jfTeste'); assert.equal(params.spreadsheetId, 'vendas'); } });
    assert.equal(result.ativos[0].preco, 300);
    assert.equal(JSON.parse(fs.readFileSync(outputPath)).length, 1);
    assert.equal(archive.length, 2);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('arquivo indisponivel impede exportacao ativa e preserva principal; correcoes manuais continuam aplicadas', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-vendas-correcao-'));
  try {
    const outputPath = path.join(root, 'crawler/jfTeste.json');
    fs.mkdirSync(path.dirname(outputPath));
    const previous = [{ linkReal: 'https://example.com/1', preco: 100 }, { linkReal: 'https://example.com/2', preco: 200 }];
    const original = JSON.stringify(previous);
    fs.writeFileSync(outputPath, original);
    const current = [{ linkReal: 'https://example.com/1', preco: 300, bairro: 'raspado' }];
    const archive = [];
    let exports = 0;
    const api = { ensureSheet: async () => 'retirados', readSheet: async () => archive, writeHeader: async (_id, _title, header) => archive.push(header), appendRows: async () => { throw new Error('Arquivo indisponivel'); } };
    const options = { outputPath, imoveisRaspados: current, consolidados: [current[0], { ...previous[1], dataExclusao: '2026-10-05' }], imobiliaria: 'jfTeste', spreadsheetId: 'vendas', adapter: api, exportToSheets: async () => { exports++; } };
    await assert.rejects(sincronizarVendas(options), /Arquivo indisponivel/);
    assert.equal(exports, 0);
    assert.equal(fs.readFileSync(outputPath, 'utf8'), original);
    const correctionsPath = path.join(root, '_03database/filtros/_jfBairrosManualCorrections.json');
    fs.mkdirSync(path.dirname(correctionsPath), { recursive: true });
    fs.writeFileSync(correctionsPath, JSON.stringify([{ file: 'jfTeste.json', linkReal: current[0].linkReal, bairro: 'centro' }]));
    api.appendRows = async (_id, _range, rows) => archive.push(...rows);
    const result = await sincronizarVendas({ ...options, exportToSheets: async data => { assert.equal([...data.values()][0].bairro, 'centro'); } });
    assert.equal(result.ativos[0].bairro, 'centro');
    assert.equal(result.ativos[0].preco, 300);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});