import test from 'node:test';
import assert from 'node:assert/strict';
import { TransactionStore } from './transactionStore.js';
import { memoryStorage } from './pilotTestSupport.js';
import { exportJfSnapshot, exportUniversalSnapshot } from './universalSheets.js';
import { CABECALHO_IMOVEIS_SHEETS } from '../../../_01extractor/crawlers/jfora/_utils/imoveisSheets.js';

const header = [...CABECALHO_IMOVEIS_SHEETS, 'precoCondominio', 'precoIptu', 'precoTotal', 'precoOutros'];
const cell = value => value === '' ? {} : { userEnteredValue: { stringValue: value } };
const row = (link, negotiation) => ({ values: [cell(link), ...Array.from({ length: 19 }, () => ({})), cell(negotiation)] });

async function setup(records = [{ linkReal: 'https://universalimoveis.com.br/imovel/novo', preco: 123 }]) {
  const storage = memoryStorage();
  const transaction = new TransactionStore({ storage, scope: 'piloto-jfuniversal-teste', computerId: 'pc' });
  let lease = await transaction.acquire(60000);
  const ref = await transaction.stage(lease, records);
  lease = (await transaction.commit(lease, { 'crawler/jfUniversal.json': ref })).lease;
  await transaction.release(lease);
  const sheet = {
    sheetId: 7, title: 'jfUniversal', rowCount: 100, columnCount: 25,
    rows: [
      { values: header.map(cell) }, row('venda-antiga', 'venda'),
      row('aluguel', 'aluguel'), row('outra-venda', 'venda'),
    ],
  };
  const api = {
    writes: 0,
    async read() { return structuredClone(sheet); },
    async write(_spreadsheetId, _sheetId, changes) {
      this.writes++;
      for (const change of changes) sheet.rows[change.index] = { values: structuredClone(change.values) };
    },
  };
  const options = { transaction, spreadsheetId: 'planilha', sheetId: 7, actor: 'operador', api };
  return { storage, transaction, sheet, api, options };
}

test('backup e verificado antes de substituir vendas, preservando linhas de aluguel', async () => {
  const { storage, sheet, api, options } = await setup();
  const rental = structuredClone(sheet.rows[2]);
  const result = await exportUniversalSnapshot(options);
  const backup = (await storage.readVersion(result.backupName, result.backupGeneration)).data;
  assert.equal(backup.rows[1][0].userEnteredValue.stringValue, 'venda-antiga');
  assert.equal(sheet.rows[1].values[0].userEnteredValue.stringValue, 'https://universalimoveis.com.br/imovel/novo');
  assert.deepEqual(sheet.rows[2], rental);
  assert.ok(sheet.rows[3].values.every(value => !value.userEnteredValue));
  assert.equal(result.vendas, 1);
  assert.equal(api.writes, 1);
});

test('nao grava se a aba mudar depois do backup', async () => {
  const { sheet, api, options } = await setup();
  const read = api.read.bind(api);
  let count = 0;
  api.read = async () => {
    if (++count === 2) sheet.rows[1] = row('alteracao-concorrente', 'venda');
    return read();
  };
  await assert.rejects(exportUniversalSnapshot(options), /Aba mudou/);
  assert.equal(api.writes, 0);
});

test('acrescenta vendas sem deslocar linhas de aluguel', async () => {
  const records = Array.from({ length: 3 }, (_, i) => ({ linkReal: `https://universalimoveis.com.br/imovel/${i}` }));
  const { sheet, options } = await setup(records);
  const rental = structuredClone(sheet.rows[2]);
  await exportUniversalSnapshot(options);
  assert.deepEqual(sheet.rows[2], rental);
  assert.equal(sheet.rows[4].values[0].userEnteredValue.stringValue, records[2].linkReal);
});

test('recusa snapshot vazio e cabecalho diferente antes de escrever', async () => {
  const empty = await setup([]);
  await assert.rejects(exportUniversalSnapshot(empty.options), /vazio ou invalido/);
  assert.equal(empty.api.writes, 0);
  const invalid = await setup();
  invalid.sheet.rows[0].values[0] = cell('outro-cabecalho');
  await assert.rejects(exportUniversalSnapshot(invalid.options), /Cabecalho/);
  assert.equal(invalid.api.writes, 0);
});

test('falha no backup impede escrita e libera o lock', async () => {
  const { storage, transaction, api, options } = await setup();
  const write = storage.write.bind(storage);
  storage.write = async (name, data, opts) => {
    if (name.startsWith('controles/backups-sheets/')) throw new Error('backup indisponivel');
    return write(name, data, opts);
  };
  await assert.rejects(exportUniversalSnapshot(options), /backup indisponivel/);
  assert.equal(api.writes, 0);
  assert.equal((await transaction.state()).data.lease, null);
});

test('escopo compartilhado exporta aluguel preservando vendas e valida a aba do projeto', async () => {
  const storage = memoryStorage();
  const transaction = new TransactionStore({ storage, scope: 'piloto-jf-compartilhado-teste', computerId: 'pc' });
  const record = { linkReal: 'https://grupoalmar.com.br/imovel/1', preco: 500 };
  let lease = await transaction.acquire(60000);
  const ref = await transaction.stage(lease, [record]);
  lease = (await transaction.commit(lease, { 'crawler/jfAlmarLocacao.json': ref })).lease;
  await transaction.release(lease);
  const sheet = {
    sheetId: 7, title: 'jfAlmar', rowCount: 100, columnCount: 21,
    rows: [
      { values: CABECALHO_IMOVEIS_SHEETS.map(cell) }, row('venda-existente', 'venda'),
      row('aluguel-antigo', 'aluguel'),
    ],
  };
  const api = {
    writes: 0,
    async read() { return structuredClone(sheet); },
    async write(_spreadsheetId, _sheetId, changes) {
      this.writes++;
      for (const change of changes) sheet.rows[change.index] = { values: structuredClone(change.values) };
    },
  };
  const options = { transaction, spreadsheetId: 'planilha', sheetId: 7, actor: 'operador', api, project: 'jfAlmar', negotiation: 'aluguel' };
  const venda = structuredClone(sheet.rows[1]);
  const result = await exportJfSnapshot(options);
  assert.deepEqual(sheet.rows[1], venda);
  assert.equal(sheet.rows[2].values[0].userEnteredValue.stringValue, record.linkReal);
  assert.equal(sheet.rows[2].values[20].userEnteredValue.stringValue, 'aluguel');
  assert.equal(result.alugueis, 1);
  assert.equal(api.writes, 1);
  sheet.title = 'outra-aba';
  await assert.rejects(exportJfSnapshot(options), /Aba jfAlmar/);
  assert.equal(api.writes, 1);
});

test('envio compartilhado rejeita escopo antigo e projeto nao habilitado', async () => {
  const { options } = await setup();
  await assert.rejects(exportJfSnapshot({ ...options, project: 'jfUniversal', negotiation: 'venda' }), /Configuracao/);
  await assert.rejects(exportJfSnapshot({ ...options, project: 'jfNaoAdaptado', negotiation: 'venda' }), /nao habilitado/);
});
