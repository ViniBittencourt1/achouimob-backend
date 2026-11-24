const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { publicationProfile, publicationArguments, typesenseSource } = require('./publication-profiles.cjs');
const { typesenseConfigurationStatus, validatePublicationConfiguration, publicationEnvironment } = require('./publication-config.cjs');

test('chave ausente bloqueia so Typesense/completo real e jamais Firestore ou simulacao',()=>{
  const profile=publicationProfile('alugueis');
  assert.doesNotThrow(()=>validatePublicationConfiguration(profile,'firestore',false,{}));
  assert.doesNotThrow(()=>validatePublicationConfiguration(profile,'completo',true,{}));
  for (const stage of ['typesense','completo']) assert.throws(()=>validatePublicationConfiguration(profile,stage,false,{}),/Typesense nao configurado/);
  assert.equal(typesenseConfigurationStatus({TYPESENSE_API_KEY:'   '}).configured,false);
  assert.equal(typesenseConfigurationStatus({TYPESENSE_API_KEY:'teste-local'}).configured,true);
  assert.ok(!JSON.stringify(typesenseConfigurationStatus({TYPESENSE_API_KEY:'segredo-de-teste'})).includes('segredo-de-teste'));
});

test('comando Typesense com chave ausente termina antes do envio com mensagem sem stack trace',()=>{
  const result=spawnSync(process.execPath,[path.join(__dirname,'publicar-imoveis.js'),'--tipo=alugueis','--etapa=typesense'],{
    env:{...process.env,TYPESENSE_API_KEY:' ',TYPESENSE_SOURCE_COLLECTION:'__alugueisPublicos'},encoding:'utf8',
  });
  assert.equal(result.status,1);
  assert.ok(result.stderr.includes('Typesense nao configurado'));
  assert.ok(!result.stderr.includes('at ModuleJob'));
  assert.ok(!result.stdout.includes('ETAPA='));
});

test('ambiente carrega arquivo backend sem imprimir chave e respeita precedencia do processo',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'publicacao-config-'));
  try {
    fs.writeFileSync(path.join(root,'.env'),'TYPESENSE_API_KEY=chave-de-teste\n');
    assert.equal(publicationEnvironment(root,{}).TYPESENSE_API_KEY,'chave-de-teste');
    assert.equal(publicationEnvironment(root,{TYPESENSE_API_KEY:'processo-de-teste'}).TYPESENSE_API_KEY,'processo-de-teste');
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('vendas preservam destinos existentes e alugueis possuem origem, backup, indice e filtros independentes', () => {
  const sales = publicationProfile('vendas');
  const rentals = publicationProfile('alugueis');
  assert.equal(sales.firestore, '__imoveisPublicos');
  assert.equal(sales.typesense, 'imoveis');
  for (const field of ['firestore', 'backup', 'typesense', 'filtrosPrefix', 'jsonSuffix']) assert.notEqual(sales[field], rentals[field]);
});

test('argumentos explicitos protegem nomes de arquivo e rejeitam tipo ou comando ambiguo', () => {
  assert.equal(publicationArguments(['--tipo=alugueis', 'jfCrispi'], {}).profile.jsonSuffix, 'Locacao.json');
  assert.equal(publicationArguments(['jfCrispi'], {}).profile.tipo, 'vendas');
  assert.equal(publicationArguments(['jfCrispi'], { PUBLICATION_MODE: 'alugueis' }).profile.tipo, 'vendas');
  for (const tipo of ['vendas', 'alugueis']) {
    assert.deepEqual(publicationArguments([`--tipo=${tipo}`, 'nitRemax', 'ubaJXavier', 'rioCasalta']).collections, ['nitRemax', 'ubaJXavier', 'rioCasalta']);
    for (const name of ['ubaJXavierLocacao', 'ubaGbRetiradosVendas', 'ubaGbHistorico', 'nitRemaxRetiradosErroSite', 'rioCasaltaLocacao', 'rioCasaltaRetiradosVendas']) {
      assert.throws(() => publicationArguments([`--tipo=${tipo}`, name]), /sem sufixo/);
    }
  }
  for (const args of [['--tipo=misturado'], ['jfCrispiLocacao'], ['../credentials'], ['--tipo=vendas', '--tipo=alugueis'], ['--foo']]) assert.throws(() => publicationArguments(args, {}));
});

test('origem Typesense nao pode atravessar perfis mesmo com variavel de ambiente', () => {
  const rentals = publicationProfile('alugueis');
  assert.equal(typesenseSource(rentals, {}), '__alugueisPublicos');
  assert.equal(typesenseSource(rentals, { TYPESENSE_SOURCE_COLLECTION: rentals.backup }), rentals.backup);
  assert.throws(() => typesenseSource(rentals, { TYPESENSE_SOURCE_COLLECTION: '__imoveisPublicos' }), /nao pertence/);
  assert.throws(() => typesenseSource(publicationProfile('vendas'), { TYPESENSE_SOURCE_COLLECTION: '__alugueisPublicos' }), /nao pertence/);
});

test('comandos das duas modalidades encaminham origem JSON direto sem executar Firestore', () => {
  for (const tipo of ['vendas', 'alugueis']) {
    const result = spawnSync(process.execPath, [path.join(__dirname, 'publicar-imoveis.js'),
      `--tipo=${tipo}`, '--etapa=typesense', '--origem=json', '--dry-run'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /ORIGEM=JSON/);
    assert.doesNotMatch(result.stdout, /ETAPA=firestore/);
    assert.match(result.stdout, /nenhum documento lido ou enviado/);
  }
  const invalid = spawnSync(process.execPath, [path.join(__dirname, 'publicar-imoveis.js'),
    '--origem=json', '--dry-run'], { encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /somente para a etapa Typesense/);
});

test('Uba compartilha documentos das duas rotas, preservando precos e finalidades', async () => {
  const { buildPublicDocs, loadPublicationRecords, replacePublicCollection } = await import('./publish-crawler-json.js');
  const { projectImovelForTypesense } = require('./_02utils/typesense/projectImovelForTypesense.cjs');
  const { mergeSelectedDocuments } = require('./_02utils/typesense/selectedProjects.cjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uba-publicacao-'));
  try {
    const records = [
      { linkReal: 'https://example.com/dual', codigoBase: '001', preco: 123456.78, cidade: 'uba-mg', bairro: 'centro', tipoImovel: 'casa' },
      { linkReal: 'https://example.com/consulta', codigoBase: '002', preco: null, cidade: 'uba-mg' },
      { linkReal: 'https://example.com/zero', codigoBase: '003', preco: 0, cidade: 'uba-mg' },
    ];
    for (const tipo of ['vendas', 'alugueis']) {
      const profile = publicationProfile(tipo);
      fs.writeFileSync(path.join(root, `ubaMontezzi${profile.jsonSuffix}`), JSON.stringify(
        tipo === 'vendas' ? [...records, records[0]] : records));
      const input = loadPublicationRecords(['ubaMontezzi'], profile, root);
      const docs = buildPublicDocs(input, profile, '2026-01-01');
      assert.equal(input.get('ubaMontezzi').length, tipo === 'vendas' ? 4 : 3);
      assert.equal(docs.length, 3);
      assert.equal(new Set(docs.map(d => d.id)).size, 3);
      const projected = docs.map(d => projectImovelForTypesense(d.data, d.id));
      assert.deepEqual(projected.map(d => d.preco), [123456.78, 0, 0]);
      assert.deepEqual(projected.map(d => d.precoSobConsulta), [false, true, false]);
      assert.ok(projected.every(d => d.imobiliariaId === 'ubaMontezzi' && d.negociacao === profile.negociacao));
      assert.equal(projected[0].cidadeNome, 'Ubá');
      const other = { id: 'outro-projeto', imobiliariaId: 'nitRemax', preco: 99 };
      assert.deepEqual(mergeSelectedDocuments([other], projected, ['ubaMontezzi'])[0], other);
      const written = new Map();
      const db = {
        collection: name => ({
          get: async () => ({ docs: name === profile.firestore ? [{
            id: other.id, ref: other.id, data: () => other,
          }] : [], size: name === profile.firestore ? 1 : 0 }),
          doc: id => `${name}/${id}`,
        }),
        batch: () => ({
          set: (ref, data) => written.set(ref, data),
          delete: () => assert.fail('Projeto nao selecionado deve ser preservado'),
          commit: async () => {},
        }),
      };
      const result = await replacePublicCollection(db, input, profile);
      assert.equal(result.total, 3);
      for (const doc of docs) {
        const stored = written.get(`${profile.firestore}/${doc.id}`);
        assert.deepEqual(projectImovelForTypesense(stored, doc.id), {
          ...projectImovelForTypesense(doc.data, doc.id), replicatedAt: stored.replicatedAt,
        });
      }
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Firestore le somente ativos do arquivo do perfil e preserva aluguel sob consulta', async () => {
  const { loadPublicationRecords } = await import('./publish-crawler-json.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'publicacao-imoveis-'));
  try {
    fs.writeFileSync(path.join(root, 'jfTeste.json'), JSON.stringify([{ linkReal: 'https://example.com/venda', preco: 300000 }]));
    fs.writeFileSync(path.join(root, 'jfTesteLocacao.json'), JSON.stringify([{ linkReal: 'https://example.com/aluguel', preco: null, codigoBase: '1', precoCondominio: 1300, precoIptu: 390, precoOutros: 0, precoTotal: 2250 }, { linkReal: 'https://example.com/retirado', preco: 800, dataExclusao: '2026-10-01' }]));
    const rentals = loadPublicationRecords(['jfTeste'], publicationProfile('alugueis'), root).get('jfTeste');
    assert.equal(rentals.length, 1);
    assert.equal(rentals[0].preco, null);
    assert.deepEqual([rentals[0].precoCondominio, rentals[0].precoIptu, rentals[0].precoOutros, rentals[0].precoTotal], [1300, 390, 0, 2250]);
    assert.equal(loadPublicationRecords(['jfTeste'], publicationProfile('vendas'), root).get('jfTeste')[0].preco, 300000);
    assert.throws(() => loadPublicationRecords(['jfAusente'], publicationProfile('alugueis'), root), /encontrado/);
    fs.writeFileSync(path.join(root, 'jfTesteLocacao.json'), JSON.stringify([{ linkReal: 'https://example.com/venda', preco: 300000, negociacao: 'venda' }]));
    assert.throws(() => loadPublicationRecords(['jfTeste'], publicationProfile('alugueis'), root), /incompativel/);
    fs.writeFileSync(path.join(root, 'jfTesteLocacao.json'), JSON.stringify([{ linkReal: 'https://example.com/1', preco: 900, codigoBase: '1' }, { linkReal: 'https://example.com/2', preco: 950, codigoBase: '1' }]));
    assert.throws(() => loadPublicationRecords(['jfTeste'], publicationProfile('alugueis'), root), /duplicados/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Luciene e FR publicam alugueis com mesmo codigo em documentos distintos por link', async () => {
  const { loadPublicationRecords, buildPublicDocs } = await import('./publish-crawler-json.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'publicacao-luciene-'));
  try {
    const records = [
      { linkReal: 'https://example.com/a', codigoBase: '1', preco: 900 },
      { linkReal: 'https://example.com/b', codigoBase: '1', preco: 950 },
    ];
    for (const collection of ['rioLuciene', 'rioFr']) {
      const file = path.join(root, `${collection}Locacao.json`);
      fs.writeFileSync(file, JSON.stringify(records));
      const profile = publicationProfile('alugueis');
      const loaded = loadPublicationRecords([collection], profile, root);
      const docs = buildPublicDocs(loaded, profile);
      assert.equal(docs.length, 2);
      assert.notEqual(docs[0].id, docs[1].id);
      fs.writeFileSync(file, JSON.stringify([records[0], records[0]]));
      assert.throws(() => loadPublicationRecords([collection], profile, root), /duplicados/);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('descoberta de vendas inclui automaticamente JSONs jf, nit e uba sem aluguel ou historico', async () => {
  const { discoverCollections, loadPublicationRecords, buildPublicDocs } = await import('./publish-crawler-json.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'publicacao-descoberta-'));
  try {
    for (const file of ['jfTeste.json', 'nitNovo.json', 'ubaGb.json', 'ubaGbLocacao.json', 'ubaGbRetiradosVendas.json', 'nitNovoLocacao.json', 'nitNovoRetirados.json', 'jfTesteHistorico.json', 'backup.json']) {
      fs.writeFileSync(path.join(root, file), JSON.stringify([{ linkReal: `https://example.com/${file}`, preco: 100 }]));
    }
    const profile = publicationProfile('vendas');
    const names = await discoverCollections(profile, root);
    assert.deepEqual(names, ['jfTeste', 'nitNovo', 'ubaGb']);
    const docs = buildPublicDocs(loadPublicationRecords(names, profile, root), profile);
    assert.equal(docs.length, 3);
    assert.ok(docs.some(doc => doc.data.imobiliariaId === 'nitNovo'));
    fs.writeFileSync(path.join(root, 'nitFuturo.json'), '[]');
    assert.ok((await discoverCollections(profile, root)).includes('nitFuturo'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('projeto suspenso nao pode ser publicado a partir dos JSONs preservados', async () => {
  const { discoverCollections, loadPublicationRecords } = await import('./publish-crawler-json.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'publicacao-suspensa-'));
  try {
    fs.writeFileSync(path.join(root, 'rioMetropole.json'), '[]');
    fs.writeFileSync(path.join(root, 'rioMetropoleLocacao.json'), '[]');
    for (const tipo of ['vendas', 'alugueis']) {
      const profile = publicationProfile(tipo);
      assert.ok(!(await discoverCollections(profile, root)).includes('rioMetropole'));
      assert.throws(() => loadPublicationRecords(['rioMetropole'], profile, root), /suspenso/);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('site desativado deixa ambos os perfis sem anuncios e nao publica historico ou aviso', async () => {
  const { discoverCollections, loadPublicationRecords, buildPublicDocs } = await import('./publish-crawler-json.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'publicacao-site-desativado-'));
  try {
    fs.writeFileSync(path.join(root, 'nitOceanica.json'), '[]');
    fs.writeFileSync(path.join(root, 'nitOceanicaLocacao.json'), '[]');
    fs.writeFileSync(path.join(root, 'nitOceanicaRetiradosErroSite.json'), JSON.stringify([{
      linkReal: 'https://example.com/retirado', preco: 100, dadosExtras: 'Erro no site', ativo: false,
    }]));
    assert.deepEqual(await discoverCollections(publicationProfile('vendas'), root), ['nitOceanica']);
    for (const tipo of ['vendas', 'alugueis']) {
      const profile = publicationProfile(tipo);
      const records = loadPublicationRecords(['nitOceanica'], profile, root);
      assert.deepEqual(records.get('nitOceanica'), []);
      assert.deepEqual(buildPublicDocs(records, profile), []);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('publicacao selecionada de aluguel preserva vendas e outras imobiliarias e cria backup exclusivo', async () => {
  const { replacePublicCollection } = await import('./publish-crawler-json.js');
  const profile = publicationProfile('alugueis');
  const store = new Map([
    [profile.firestore, new Map([['old', { imobiliariaId: 'jfTeste', linkReal: 'https://example.com/old' }], ['other', { imobiliariaId: 'jfOutra', preco: 700 }]])],
    ['__imoveisPublicos', new Map([['sale', { preco: 300000 }]])],
  ]);
  const get = name => { if (!store.has(name)) store.set(name, new Map()); return store.get(name); };
  const db = { collection: name => ({
    get: async () => ({ size: get(name).size, docs: [...get(name)].map(([id,data]) => ({ id, ref: { name,id }, data: () => data })) }),
    doc: id => ({ name,id }),
  }), batch: () => {
    const ops = [];
    return { set: (ref,data) => ops.push(() => get(ref.name).set(ref.id,data)), delete: ref => ops.push(() => get(ref.name).delete(ref.id)), commit: async () => ops.forEach(op => op()) };
  } };
  await replacePublicCollection(db, new Map([['jfTeste', [{ linkReal: 'https://example.com/novo', codigoBase: '1', preco: 950, precoCondominio: 1300, precoIptu: 390, precoOutros: 100, precoTotal: 2740 }]]]), profile);
  assert.equal(store.get('__imoveisPublicos').get('sale').preco, 300000);
  assert.equal(store.get(profile.firestore).get('other').preco, 700);
  assert.equal(store.get(profile.firestore).has('old'), false);
  assert.equal(store.get(profile.backup).size, 2);
  const published = [...store.get(profile.firestore).values()].find(item => item.imobiliariaId === 'jfTeste');
  assert.equal(published.negociacao, 'locacao');
  assert.equal(published.preco, 950);
  assert.deepEqual([published.precoCondominio, published.precoIptu, published.precoOutros, published.precoTotal], [1300, 390, 100, 2740]);
  await replacePublicCollection(db, new Map([['jfTeste', []]]), profile);
  assert.ok(![...store.get(profile.firestore).values()].some(item => item.imobiliariaId === 'jfTeste'));
  assert.equal(store.get(profile.firestore).get('other').preco, 700);
  assert.equal(store.get('__imoveisPublicos').get('sale').preco, 300000);
});

test('falha na gravacao Firestore nao exclui antecipadamente os documentos anteriores', async () => {
  const { replacePublicCollection } = await import('./publish-crawler-json.js');
  const profile = publicationProfile('alugueis');
  const current = new Map([['old', { imobiliariaId:'jfTeste', linkReal:'https://example.com/antigo', preco:800 }]]);
  const backup = new Map();
  let commits = 0;
  const db = { collection: name => ({
    get: async () => { const data = name === profile.firestore ? current : backup; return { size:data.size, docs:[...data].map(([id,item])=>({id,ref:{name,id},data:()=>item})) }; },
    doc: id => ({name,id}),
  }), batch: () => {
    const ops = [];
    return { set:(ref,data)=>ops.push(()=> (ref.name===profile.firestore ? current:backup).set(ref.id,data)), delete:ref=>ops.push(()=> (ref.name===profile.firestore ? current:backup).delete(ref.id)), commit:async()=>{ commits++; if(commits===2) throw new Error('Falha de gravacao'); ops.forEach(op=>op()); } };
  } };
  await assert.rejects(replacePublicCollection(db,new Map([['jfTeste',[{linkReal:'https://example.com/novo',preco:950,codigoBase:'1'}]]]),profile),/Falha de gravacao/);
  assert.equal(current.get('old').preco,800);
  assert.equal(backup.get('old').preco,800);
});

test('falha de backup impede a publicacao de ativos novos no Firestore',async()=>{
  const {replacePublicCollection}=await import('./publish-crawler-json.js');
  const profile=publicationProfile('alugueis');
  const current=new Map([['old',{imobiliariaId:'jfTeste',preco:800}]]);
  const operations=[];
  const db={collection:name=>({
    get:async()=>({size:name===profile.firestore?1:0,docs:name===profile.firestore?[{id:'old',ref:{name,id:'old'},data:()=>current.get('old')}]:[]}),
    doc:id=>({name,id}),
  }),batch:()=>({set:(ref,data)=>operations.push({ref,data}),delete:ref=>operations.push({ref}),commit:async()=>{throw new Error('Backup indisponivel');}})};
  await assert.rejects(replacePublicCollection(db,new Map([['jfTeste',[{linkReal:'https://example.com/novo',codigoBase:'1',preco:900}]]]),profile),/Backup indisponivel/);
  assert.equal(current.get('old').preco,800);
  assert.ok(operations.every(operation=>operation.ref.name===profile.backup));
});

test('migrador de aluguel usa apenas seus indices e filtros, sem executar servicos reais', async () => {
  const file = path.join(__dirname, '_02utils/typesense/migrateImoveisToTypesense.cjs');
  const collections = new Map();
  const reads = [];
  class Client {
    collections(name) {
      if (!name) return { create: async schema => { collections.set(schema.name, []); return schema; } };
      return {
        retrieve: async () => { if (!collections.has(name)) throw { httpStatus:404 }; return { num_documents: collections.get(name).length }; },
        delete: async () => collections.delete(name),
        documents: () => ({ import: async ndjson => { const docs = ndjson.split('\n').filter(Boolean).map(line => JSON.parse(line)); collections.get(name).push(...docs); return docs.map(() => ({success:true})); } }),
      };
    }
  }
  const admin = { initializeApp: () => {}, credential: { cert: () => ({}) }, firestore: () => ({ collection: name => ({ get: async () => {
    reads.push(name);
    return { docs: [{ id:'rental', data: () => ({ linkReal:'https://example.com/rental', preco:null, negociacao:'locacao', cidade:'juiz-de-fora-mg', bairro:'centro', tipoImovel:'apartamento' }) }] };
  } }) }) };
  const context = { __dirname:path.dirname(file), process:{argv:['node',file,'--tipo=alugueis'],env:{TYPESENSE_API_KEY:'teste-local'},exitCode:0}, console:{log:()=>{},error:()=>{},warn:()=>{}}, require: name => {
    if (name === 'firebase-admin') return admin;
    if (name === 'typesense') return {Client};
    if (name === 'dotenv') return {config:()=>{}};
    if (name.includes('credentials/firebase-key')) return {};
    if (name.startsWith('.')) return require(path.resolve(path.dirname(file),name));
    return require(name);
  } };
  await vm.runInNewContext(fs.readFileSync(file,'utf8'),context);
  assert.deepEqual(reads,['__alugueisPublicos']);
  assert.ok([...collections.keys()].every(name => name === 'imoveis_alugueis' || name.startsWith('filtros_alugueis_')));
  assert.equal(collections.size,8);
  assert.equal(collections.get('imoveis_alugueis')[0].precoSobConsulta,true);
  assert.equal(context.process.exitCode,0);
});

test('fluxo completo em simulacao usa a principal atualizada mesmo com backup no ambiente', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'publicar-imoveis.js'), '--tipo=alugueis', 'jfCrispi', '--dry-run'], {
    env: { ...process.env, TYPESENSE_SOURCE_COLLECTION: '__alugueisPublicos__backup' }, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('FIRESTORE_ORIGEM=__alugueisPublicos TYPESENSE=imoveis_alugueis'));
  assert.ok(!result.stdout.includes('FIRESTORE_ORIGEM=__alugueisPublicos__backup'));
});