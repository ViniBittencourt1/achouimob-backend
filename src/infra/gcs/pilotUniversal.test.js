import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { runUniversalSalesGcs, UNIVERSAL_SALES_DOCUMENTS } from '../../../_01extractor/crawlers/jfora/universal/gcsVendas.js';
import { OperationalStore, StaleSnapshotError } from './operationalStore.js';
import { TransactionStore } from './transactionStore.js';
import { prepareUniversalPilot } from './prepareUniversalPilot.js';
import { deliverReport, retryPendingReports } from './reportSheets.js';
import { fakeSheets, memoryStorage, pilotValues } from './pilotTestSupport.js';

async function setup() {
  const storage = memoryStorage();
  const source = new TransactionStore({ storage, scope: 'base-preparacao-inicial', computerId: 'pc-a' });
  const transaction = new TransactionStore({ storage, scope: 'piloto-jfuniversal-teste', computerId: 'pc-a' });
  let lease = await source.acquire(60000);
  const documents = {};
  for (const [key, value] of Object.entries(pilotValues())) documents[key] = await source.stage(lease, value);
  lease = (await source.commit(lease, documents)).lease;
  await source.release(lease);
  await prepareUniversalPilot({ source, destination: transaction, actor: 'operador' });
  return { source, transaction, store: new OperationalStore({ transaction }) };
}

const collected = async () => ({ totalEsperado: 2, imoveis: [
  { linkReal: 'https://universalimoveis.com.br//imovel/1', codigoBase: '1', preco: 300, cidade: 'coletada', bairro: 'coletado' },
  { linkReal: 'https://universalimoveis.com.br//imovel/3', codigoBase: '3', preco: 400 },
] });

test('piloto reconcilia coleta, correcoes, duplicados, historicos e relatorio atomicamente', async () => {
  const { store, source } = await setup();
  const result = await runUniversalSalesGcs({ store, actor: 'operador', collect: collected });
  const snapshot = await store.read([...UNIVERSAL_SALES_DOCUMENTS, result.auditKey, result.reportKey]);
  const [first, added] = snapshot.values['crawler/jfUniversal.json'];
  assert.equal(first.dataInclusao, '2020-01-01');
  assert.equal(first.cidade, '');
  assert.equal(first.bairro, 'bairro-corrigido');
  assert.equal(first.tipoImovel, 'casa');
  assert.equal(first.localizacao, 'corrigida');
  assert.equal(first.linkFoto, 'foto-corrigida');
  assert.equal(first.preco, 123);
  assert.equal(first.duplicado_grupo, 'grupo1');
  assert.equal(added.linkReal, 'https://universalimoveis.com.br//imovel/3');
  const removed = snapshot.values['crawler/jfUniversalRetiradosVendas.json'];
  assert.equal(removed.length, 2);
  assert.equal(removed[1].campoExtra, 'preservado');
  assert.ok(removed[1].retiradaId);
  const history = snapshot.values['_03database/filtros/jfHistoricoRaspagens.json'];
  assert.equal(history.outroProjeto.anterior.totalImoveis, 3);
  assert.equal(Object.values(history.jfUniversal)[0].totalImoveis, 2);
  assert.deepEqual(result.summary, { project: 'jfUniversal', negociacao: 'venda', totalEsperado: 2, ativos: 2, novos: 1, alterados: 1, retirados: 1 });
  assert.equal(snapshot.values[result.reportKey].status, 'pendente');
  assert.equal((await source.current()).revision, 1);
});

test('coleta parcial, duplicada, falha ou dados invalidos nao alteram a base', async () => {
  const { store, transaction } = await setup();
  const failures = [
    async () => ({ totalEsperado: 2, imoveis: [] }),
    async () => ({ totalEsperado: 2, imoveis: [{ linkReal: 'https://universalimoveis.com.br/imovel/1', codigoBase: '1' }, { linkReal: 'https://universalimoveis.com.br/imovel/2', codigoBase: '1' }] }),
    async () => ({ totalEsperado: 1, imoveis: [{ linkReal: 'https://outro-site.com/imovel/1', codigoBase: '1' }] }),
    async () => ({ totalEsperado: 1, imoveis: [{ linkReal: 'https://universalimoveis.com.br:8443/imovel/1', codigoBase: '1' }] }),
    async () => ({ totalEsperado: 2, imoveis: [{ linkReal: 'https://universalimoveis.com.br/imovel/1', codigoBase: '1' }, { linkReal: 'https://universalimoveis.com.br//imovel/1', codigoBase: '2' }] }),
    async () => { throw new Error('site indisponivel'); },
  ];
  for (const collect of failures) await assert.rejects(runUniversalSalesGcs({ store, actor: 'operador', collect }));
  assert.equal((await transaction.current()).revision, 1);
});

test('historico ou correcoes invalidas interrompem antes de acessar o site', async () => {
  const { store } = await setup();
  const key = '_03database/outros/preco-json-manual-corrections.json';
  await store.commit(await store.read([key]), {
    operationId: randomUUID(), type: 'correcao', actor: 'operador', changes: { [key]: {} }, report: {},
  });

  let called = false;
  await assert.rejects(runUniversalSalesGcs({ store, actor: 'operador', collect: async () => { called = true; return collected(); } }), /Correcoes invalidas/);
  assert.equal(called, false);
  assert.equal((await store.read(['crawler/jfUniversal.json'])).revision, 2);
});

test('catalogo invalido interrompe antes da coleta', async () => {
  const { store } = await setup();
  const key = '_03database/filtros/_brCidades.json';
  await store.commit(await store.read([key]), {
    operationId: randomUUID(), type: 'correcao', actor: 'operador', changes: { [key]: [] }, report: {},
  });
  let called = false;
  await assert.rejects(runUniversalSalesGcs({ store, actor: 'operador', collect: async () => { called = true; return collected(); } }), /Catalogos do GCS/);
  assert.equal(called, false);
});

test('zero confirmado pelo coletor arquiva anuncios sem apagar o historico anterior', async () => {
  const { store } = await setup();
  const result = await runUniversalSalesGcs({ store, actor: 'operador', collect: async () => ({ totalEsperado: 0, imoveis: [] }) });
  const snapshot = await store.read(['crawler/jfUniversal.json', 'crawler/jfUniversalRetiradosVendas.json']);
  assert.deepEqual(snapshot.values['crawler/jfUniversal.json'], []);
  assert.equal(snapshot.values['crawler/jfUniversalRetiradosVendas.json'].length, 3);
  assert.equal(result.summary.retirados, 2);
});

test('alteracao concorrente durante a coleta nao e sobrescrita', async () => {
  const { store } = await setup();
  const collect = async () => {
    const snapshot = await store.read(['_03database/outros/preco-json-manual-corrections.json']);
    await store.commit(snapshot, { operationId: randomUUID(), type: 'correcao', actor: 'outro', changes: { '_03database/outros/preco-json-manual-corrections.json': [] }, report: {} });
    return collected();
  };
  await assert.rejects(runUniversalSalesGcs({ store, actor: 'operador', collect }), StaleSnapshotError);
  const snapshot = await store.read(['crawler/jfUniversal.json', '_03database/outros/preco-json-manual-corrections.json']);
  assert.equal(snapshot.revision, 2);
  assert.equal(snapshot.values['crawler/jfUniversal.json'][0].preco, 100);
  assert.deepEqual(snapshot.values['_03database/outros/preco-json-manual-corrections.json'], []);
});

test('falha no Sheets nao bloqueia dados; reprocessamento e idempotente apos resposta perdida', async () => {
  const { store } = await setup();
  const api = fakeSheets();
  const operationId = randomUUID();
  const failAfterWrite = { ...api, writeSheet: async (id, range, values) => {
    await api.writeSheet(id, range, values);
    if (!range.endsWith('A1:G1')) throw new Error('resposta Sheets perdida');
  } };
  const result = await runUniversalSalesGcs({
    store, actor: 'operador', operationId, collect: collected,
    report: id => deliverReport({ store, operationId: id, spreadsheetId: 'planilha', actor: 'operador', api: failAfterWrite }),
  });
  assert.match(result.reportWarning, /resposta Sheets perdida/);
  const pending = await store.read([result.reportKey, 'crawler/jfUniversal.json']);
  assert.equal(pending.values[result.reportKey].status, 'pendente');
  assert.equal(pending.values['crawler/jfUniversal.json'].length, 2);
  assert.equal(api.writes.length, 2);
  const retry = await retryPendingReports({ store, spreadsheetId: 'planilha', actor: 'operador', api });
  assert.deepEqual(retry, [{ status: 'entregue', operationId }]);
  assert.equal(api.writes.length, 2);
  assert.equal((await store.read([result.reportKey])).values[result.reportKey].status, 'entregue');
  assert.deepEqual(await retryPendingReports({ store, spreadsheetId: 'planilha', actor: 'operador', api }), []);
});

test('relatorio nao muda de destino e recusa linha de outro conteudo', async () => {
  const { store } = await setup();
  const result = await runUniversalSalesGcs({ store, actor: 'operador', collect: collected });
  const api = fakeSheets();
  await store.updateReport(result.operationId, 'planilha', 'operador');
  await assert.rejects(deliverReport({ store, operationId: result.operationId, spreadsheetId: 'outra', actor: 'operador', api }), /outra planilha/);
  api.cells.set(`'GCS-piloto-jfuniversal-teste'!A3:G3`, ['outro']);
  await assert.rejects(deliverReport({ store, operationId: result.operationId, spreadsheetId: 'planilha', actor: 'operador', api }), /ocupada/);
  assert.equal((await store.read([result.reportKey])).values[result.reportKey].status, 'pendente');
});

test('piloto nao sobrescreve escopo existente nem inicia sem procedencia', async () => {
  const { source, transaction, store } = await setup();
  await assert.rejects(prepareUniversalPilot({ source, destination: transaction, actor: 'operador' }), /ja existe/);
  const snapshot = await store.read(['_piloto/origem.json']);
  await store.commit(snapshot, {
    operationId: randomUUID(), type: 'correcao', actor: 'operador',
    changes: { '_piloto/origem.json': { invalida: true } }, report: {},
  });
  let called = false;
  await assert.rejects(runUniversalSalesGcs({ store, actor: 'operador', collect: async () => { called = true; return collected(); } }), /Origem do piloto invalida/);
  assert.equal(called, false);
});

test('operacao ja confirmada nao volta a acessar o site', async () => {
  const { store } = await setup();
  const operationId = randomUUID();
  await runUniversalSalesGcs({ store, operationId, actor: 'operador', collect: collected });
  let called = false;
  await assert.rejects(runUniversalSalesGcs({ store, operationId, actor: 'operador', collect: async () => { called = true; return collected(); } }), /Operacao ja registrada/);
  assert.equal(called, false);
});
