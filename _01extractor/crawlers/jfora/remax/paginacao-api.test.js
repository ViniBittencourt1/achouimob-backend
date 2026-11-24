import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { EventEmitter } from 'node:events';
import { createRemaxSearchBatches, installRemaxSearchBatches } from './paginacao-api.js';

const filter = 'content/CityID eq 6579324 and content/TransactionTypeUID eq 261';
const record = key => ({ content: { ListingKey: key } });

test('lotes RE/MAX excluem chaves anteriores e mantem filtros e total da busca', async () => {
  const calls = [];
  const read = createRemaxSearchBatches(async body => {
    calls.push(body);
    return calls.length === 1 ? { '@odata.count': 3, value: [record('A'), record('B')] } : { '@odata.count': 1, value: [record('C')] };
  });
  const first = await read({ filter, skip: 0, top: 2 });
  const second = await read({ filter, skip: 2, top: 2 });
  assert.equal(second['@odata.count'], 3);
  assert.equal(calls[1].skip, 0);
  assert.ok(calls[1].filter.includes("not search.in(content/ListingKey, 'A|B', '|')"));
  assert.deepEqual(await read({ filter, skip: 0, top: 2 }), first);
  assert.equal(calls.length, 2);
});

test('lotes RE/MAX nao misturam aluguel e venda nem aceitam duplicatas', async () => {
  const read = createRemaxSearchBatches(async () => ({ '@odata.count': 3, value: [record('A'), record('B')] }));
  await read({ filter, skip: 0, top: 2 });
  await assert.rejects(read({ filter: filter.replace('261', '260'), skip: 2, top: 2 }), /Filtros.*mudaram/);
  await assert.rejects(read({ filter, skip: 2, top: 2 }), /Total.*mudou/);
  const duplicated = createRemaxSearchBatches(async () => ({ '@odata.count': 2, value: [record('A'), record('A')] }));
  await assert.rejects(duplicated({ filter, skip: 0, top: 2 }), /repetida/);
});

test('lotes RE/MAX abortam total alterado, pagina fora de sequencia e resposta vazia', async () => {
  const read = createRemaxSearchBatches(async () => ({ '@odata.count': 2, value: [] }));
  await assert.rejects(read({ filter, skip: 2, top: 2 }), /sequencia/);
  await assert.rejects(read({ filter, skip: 0, top: 2 }), /vazio/);
});

test('Niteroi parametriza cidade e venda sem permitir filtros de Juiz de Fora ou aluguel', async () => {
  const niteroiFilter = filter.replace('6579324', '6580792');
  const read = createRemaxSearchBatches(async () => ({ '@odata.count': 1, value: [record('N')] }), { cityId: 6580792, transactionType: 261 });
  await assert.rejects(read({ filter, skip: 0, top: 24 }), /sem filtros/);
  await assert.rejects(read({ filter: niteroiFilter.replace('261', '260'), skip: 0, top: 24 }), /sem filtros/);
  assert.equal((await read({ filter: niteroiFilter, skip: 0, top: 24 }))['@odata.count'], 1);
  assert.throws(() => createRemaxSearchBatches(async () => ({}), { cityId: 0 }), /invalidos/);
});

test('busca estadual exige estado e modalidade e rejeita cidade ou disjuncao', async () => {
  for (const transactionType of [260, 261]) {
    const filter = `content/ProvinceID eq 9517 and content/TransactionTypeUID eq ${transactionType}`;
    const read = createRemaxSearchBatches(async () => ({ '@odata.count': 0, value: [] }), { cityId: null, provinceId: 9517, transactionType });
    for (const invalid of [filter.replace('9517', '9512'), filter.replace(String(transactionType), String(transactionType === 260 ? 261 : 260)), `${filter} and content/CityID eq 123`, `${filter} or true`]) {
      await assert.rejects(read({ filter: invalid, skip: 0, top: 100 }), /sem filtros/);
    }
    assert.equal((await read({ filter, skip: 0, top: 100 }))['@odata.count'], 0);
  }
});

test('precontagem intercepta apenas resposta com cidade e aluguel, ignorando busca inicial geral', async () => {
  for (const cityId of [6579324, 6580792]) {
    const calls = [];
    const session = new EventEmitter();
    session.send = async (command, args) => { calls.push([command, args]); };
    session.detach = async () => { calls.push(["detach"]); };
    const fetchMock = mock.method(globalThis, "fetch", async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.match(body.filter, new RegExp(`CityID eq ${cityId}`));
      assert.match(body.filter, /TransactionTypeUID eq 260/);
      return { ok: true, json: async () => ({ "@odata.count": 2, value: [record("A"), record("B")] }) };
    });
    const api = await installRemaxSearchBatches({ createCDPSession: async () => session }, { cityId, transactionType: 260 });
    try {
      const request = async (id, requestFilter) => session.listeners("Fetch.requestPaused")[0]({
        requestId: id, request: { method: "POST", postData: JSON.stringify({ filter: requestFilter, count: true, top: 24, skip: 0 }) },
      });
      await request("geral", "content/TransactionTypeUID eq 260");
      await request("venda", `content/CityID eq ${cityId} and content/TransactionTypeUID eq 261`);
      await request("outra-cidade", `content/CityID eq 123 and content/TransactionTypeUID eq 260`);
      assert.equal(fetchMock.mock.callCount(), 0);
      assert.equal(calls.filter(([command]) => command === "Fetch.continueRequest").length, 3);
      await request("filtrada", `content/CityID eq ${cityId} and content/TransactionTypeUID eq 260`);
      assert.equal(await api.waitUntilReady(), 2);
      api.assertHealthy();
      const fulfilled = calls.find(([command]) => command === "Fetch.fulfillRequest")[1];
      assert.equal(JSON.parse(Buffer.from(fulfilled.body, "base64").toString())["@odata.count"], 2);
    } finally {
      await api.close();
      fetchMock.mock.restore();
    }
    assert.equal(session.listenerCount("Fetch.requestPaused"), 0);
    assert.ok(calls.some(([command]) => command === "detach"));
  }
});