const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { validateSelectedProjects, mergeSelectedDocuments } = require('./selectedProjects.cjs');
const { filterAvailableDocuments } = require('../../crawler-availability.cjs');
const { projetoSuspenso } = require('../../crawler-order.cjs');

test('selecao valida nomes conhecidos e rejeita vazio, desconhecidos e tipos invalidos', () => {
  assert.deepEqual(validateSelectedProjects(['jfLider', 'jfLider'], ['jfLider']), ['jfLider']);
  for (const value of [[], null, 'jfLider', ['jfInvalido'], [1]]) {
    assert.throws(() => validateSelectedProjects(value, ['jfLider']), /projeto JSON valido/);
  }
});

test('mescla preserva todos os campos dos desmarcados e remove ausentes dos marcados', () => {
  const acervo = { id: 'a', imobiliariaId: 'jfAcervo', preco: 10, extra: 'preservado' };
  const souza = { id: 's', imobiliariaId: 'jfSouzaGomes', preco: 20 };
  const old = { id: 'old', imobiliariaId: 'jfLider', preco: 30 };
  const result = mergeSelectedDocuments([acervo, souza, old, { id: 'l', imobiliariaId: 'jfLider', preco: 1 }], [{ id: 'l', preco: 99 }, { id: 'new', preco: 5 }], ['jfLider']);
  assert.equal(result.length, 4);
  assert.equal(result[0], acervo);
  assert.equal(result[1], souza);
  assert.ok(!result.includes(old));
  assert.equal(result.find(doc => doc.id === 'l').preco, 99);
});

async function executarMigracao({ selectedProjects = ['jfLider'], updateId = 'l', exportError, availability = {}, tipo = 'vendas', extras = [] } = {}) {
  const source = fs.readFileSync(path.join(__dirname, 'migrateImoveisToTypesense.cjs'), 'utf8');
  const start = source.indexOf('async function migrate()');
  const end = source.lastIndexOf('migrate();');
  const existing = [{ id: 'a', imobiliariaId: 'jfAcervo', preco: 10, cidade: 'cidade-preservada' }, { id: 'l', imobiliariaId: 'jfLider', preco: 1 }, { id: 'old', imobiliariaId: 'jfLider', preco: 3 }, ...extras];
  const store = new Map(existing.map(doc => [doc.id, doc]));
  const imports = [];
  const deleted = [];
  const schemaUpdates = [];
  const collections = name => ({
    retrieve: async () => ({ num_documents: store.size, fields: [] }),
    update: async schema => { schemaUpdates.push(schema); },
    delete: async () => { deleted.push(name); },
    documents: id => ({
      delete: async () => {
        assert.ok(deleted.some(name => name.startsWith('filtros_')), 'Exclusoes ocorrem depois da atualizacao de filtros');
        deleted.push(id);
        store.delete(id);
      },
      export: async () => {
        if (exportError) throw exportError;
        return existing.map(doc => JSON.stringify(doc)).join('\n');
      },
      import: async ndjson => {
        const docs = ndjson.split('\n').filter(Boolean).map(line => JSON.parse(line));
        imports.push({ name, docs });
        if (name === 'imoveis') docs.forEach(doc => store.set(doc.id, doc));
        return docs.map(() => ({ success: true }));
      },
    }),
  });
  const typesenseClient = { collections: name => name ? collections(name) : { create: async () => {} } };
  const context = {
    console: { log() {}, warn() {}, error: (...args) => { throw new Error(args.join(' ')); } },
    process: { exitCode: 0 }, Date, Map, Set,
    origemJson: true, sourceCollection: '__imoveisPublicos',
    selectedProjects, mergeSelectedDocuments, filterAvailableDocuments, projetoSuspenso, loadAvailability: () => availability,
    profile: { tipo, negociacao: tipo === 'vendas' ? 'venda' : 'locacao', typesense: 'imoveis', filtrosPrefix: 'filtros_' },
    publication: { allowEmpty: false }, typesenseClient, bairrosData: [],
    projectImovelForTypesense: (data, id) => ({ ...data, id }),
    carregarDocumentosOrigem: async () => [{ id: updateId, data: { imobiliariaId: 'jfLider', preco: 99, cidade: 'cidade-nova' } }],
    parseImportResponse: value => value, isQuotaExceededError: () => false,
  };
  vm.createContext(context);
  await vm.runInContext(`${source.slice(start, end)}\nmigrate();`, context);
  return { deleted, imports, schemaUpdates, store, existing };
}

test('migracao seletiva nao apaga nem reimporta documentos desmarcados e calcula filtros da base completa', async () => {
  const { deleted, imports, schemaUpdates, store, existing } = await executarMigracao();
  assert.ok(!deleted.includes('imoveis'));
  assert.deepEqual(Array.from(schemaUpdates[0].fields, field => field.name), ['precoCondominio', 'precoIptu', 'precoTotal', 'precoOutros']);
  assert.ok(schemaUpdates[0].fields.every(field => field.type === 'float' && field.facet && field.optional));
  assert.deepEqual(imports.find(item => item.name === 'imoveis').docs.map(doc => doc.id), ['l']);
  assert.deepEqual(store.get('a'), existing[0]);
  assert.ok(!store.has('old'));
  assert.deepEqual(deleted.filter(name => !name.startsWith('filtros_')), ['old']);
  const cities = imports.find(item => item.name === 'filtros_cidade').docs;
  assert.ok(cities.some(doc => doc.slug === 'cidade-preservada'));
  assert.ok(cities.some(doc => doc.slug === 'cidade-nova'));
});

test('colisao com ID desmarcado bloqueia migracao antes de qualquer alteracao', async () => {
  await assert.rejects(executarMigracao({ updateId: 'a' }), /ID compartilhado com projeto desmarcado/);
});

test('falha na leitura do destino nao continua com filtros parciais', async () => {
  await assert.rejects(executarMigracao({ exportError: new Error('Rede indisponivel') }), /Rede indisponivel/);
});

test('projeto indisponivel fica fora de envios e filtros mesmo desmarcado ou vindo do backup', async () => {
  const availability = {
    'jfAcervo:vendas': { collection: 'jfAcervo', tipo: 'vendas', unavailable: true },
    'jfLider:vendas': { collection: 'jfLider', tipo: 'vendas', unavailable: true },
  };
  const { imports, store, deleted } = await executarMigracao({ availability });
  assert.equal(store.size, 0);
  assert.deepEqual(deleted.filter(name => !name.startsWith('filtros_')).sort(), ['a', 'l', 'old']);
  assert.ok(!imports.some(item => item.name === 'imoveis'));
  assert.ok(imports.filter(item => item.name.startsWith('filtros_')).every(item => item.docs.length === 0));
});

test('suspensao de vendas nao bloqueia publicacao de aluguel da mesma imobiliaria', async () => {
  const availability = { 'jfLider:vendas': { collection: 'jfLider', tipo: 'vendas', unavailable: true } };
  const { store } = await executarMigracao({ availability, tipo: 'alugueis' });
  assert.equal(store.get('l').preco, 99);
});

test('projeto suspenso fica fora dos indices e filtros mesmo desmarcado', async () => {
  const { store, deleted, imports } = await executarMigracao({
    extras: [{ id: 'metropole', imobiliariaId: 'rioMetropole', cidade: 'cidade-suspensa' }],
  });
  assert.ok(!store.has('metropole'));
  assert.ok(deleted.includes('metropole'));
  assert.ok(!imports.find(item => item.name === 'filtros_cidade').docs.some(doc => doc.slug === 'cidade-suspensa'));
});

test('API valida selecao antes de iniciar fila e encaminha escopo ao processo filho', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', '_01extractor', 'crawlers', 'jfora', '_1Jf', 'jfora.js'), 'utf8');
  let handler;
  const calls = [];
  const context = {
    app: { post: (_route, callback) => { handler = callback; } },
    running: false, emitLog() {}, validateSelectedProjects, path,
    fs: { readdirSync: () => ['jfAcervo.json', 'jfLider.json', 'rioMetropole.json'] },
    projetoSuspenso,
    arquivoPrincipalVendas: () => true, backendRoot: 'backend',
    process: { env: {} }, TYPESENSE_SCRIPT: 'current', TYPESENSE_BACKUP_SCRIPT: 'backup', TYPESENSE_JSON_SCRIPT: 'json',
    loadPackageJson: () => ({ scripts: { json: 'mock', current: 'mock' } }),
    runQueue: async (...args) => { calls.push(args); },
  };
  const start = source.indexOf('app.post("/api/send-typesense"');
  const end = source.indexOf('app.get("/api/typesense-source-info"', start);
  vm.runInNewContext(source.slice(start, end), context);
  for (const body of [
    { source: 'json', selectedProjects: [] },
    { source: 'json', selectedProjects: ['jfDesconhecido'] },
    { source: 'json', selectedProjects: ['rioMetropole'] },
    { source: 'current', selectedProjects: ['jfLider'] },
  ]) {
    let status;
    await handler({ body }, { status: code => { status = code; return { json() {} }; } });
    assert.equal(status, 400);
    assert.equal(calls.length, 0);
  }
  await handler({ body: { source: 'json', selectedProjects: ['jfLider'] } }, { json() {} });
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0][2].TYPESENSE_SELECTED_PROJECTS), ['jfLider']);
});
