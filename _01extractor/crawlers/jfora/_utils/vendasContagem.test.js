import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { projetosContagemVendas, projetoContagemVendas } from './vendasContagemProjetos.js';
import { RIO_SPREADSHEET_ID } from '../rio/projects.js';

const calls = [];
let rows = [];
mock.module('../../../services/googleSheets.js', {
  namedExports: {
    ensureSheet: async (...args) => { calls.push(['ensure', ...args]); return 'retorno'; },
    readSheet: async () => rows,
    writeHeader: async (...args) => calls.push(['header', ...args]),
    writeSheet: async (...args) => calls.push(['write', ...args]),
    writeSheets: async (id, data) => {
      calls.push(['batch', id, data.filter(item => /!A[2-9]\d*:C\d+$/.test(item.range))]);
      for (const item of data) {
        if (item.range.endsWith("!A1:C1")) calls.push(['header', id, 'retorno', item.values[0]]);
        else if (/!A\d+:C\d+$/.test(item.range)) calls.push(['write', id, item.range, item.values]);
      }
    },
  },
});
const { registrarTotalVendas, registrarTotaisVendas, contarAntesDasVendas, parseTotalVendas, validarUrlContagemVendas, lerContagemVendasDOM, recuperarBuscaSoaresDOM } = await import('./vendasContagem.js');

test('Predial conta texto renderizado mesmo com textContent concatenado e rejeita aluguel', async () => {
  const project = projetoContagemVendas('nitPredial');
  validarUrlContagemVendas(project, project.url);
  assert.throws(() => validarUrlContagemVendas(project, project.url.replace('venda', 'aluguel')), /exclusiva de venda/);
  let closed = false;
  const dom = new JSDOM('<body><h1>Imóveis à venda em Niterói</h1><p>Explore a região no mapa.</p><p>367 imóveis encontrados</p></body>');
  Object.defineProperty(dom.window.document.body, 'innerText', {
    value: 'Imóveis à venda em Niterói\nExplore a região no mapa.\n367 imóveis encontrados\nVeja também imóveis para alugar',
  });
  const previous = globalThis.document;
  globalThis.document = dom.window.document;
  const page = {
    goto: async () => ({ status: () => 200 }),
    url: () => project.url,
    waitForFunction: async (callback, _options, ...args) => assert.ok(callback(...args)),
    evaluate: async (callback, ...args) => callback(...args),
    close: async () => { closed = true; },
  };
  try {
    assert.match(dom.window.document.body.textContent, /mapa\.367/);
    assert.equal(await contarAntesDasVendas({ newPage: async () => page }, {
      projeto: 'nitPredial', salvar: false,
    }), 367);
    dom.window.document.querySelector('h1').textContent = 'Imóveis para alugar em Niterói';
    assert.equal(lerContagemVendasDOM(project), false);
    assert.equal(closed, true);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
    dom.window.close();
  }
});

test('contagem recupera DNS transitorio sem consumir as tentativas de HTTP 429', async t => {
  calls.length = 0;
  const waits = [];
  const warnings = [];
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => { waits.push(delay); callback(); });
  t.mock.method(console, 'warn', message => warnings.push(message));
  const project = projetoContagemVendas('jfCrispi');
  const results = [
    new Error('net::ERR_NAME_NOT_RESOLVED'),
    { status: () => 429, headers: () => ({}) },
    new Error('net::ERR_NAME_RESOLUTION_FAILED'),
    { status: () => 200 },
  ];
  let closed = 0;
  let navigations = 0;
  const page = {
    goto: async url => {
      assert.equal(url, project.url);
      navigations++;
      const result = results.shift();
      if (result instanceof Error) throw result;
      return result;
    },
    url: () => project.url,
    waitForFunction: async () => {},
    evaluate: async () => ({ label: 'Exibindo 123 Imoveis a venda' }),
    close: async () => { closed++; },
  };
  assert.equal(await contarAntesDasVendas({ newPage: async () => page }, {
    projeto: 'jfCrispi', salvar: false, esperasBloqueioMs: [1],
  }), 123);
  assert.equal(navigations, 4);
  assert.deepEqual(waits, [2000, 1, 4000]);
  assert.equal(warnings.length, 3);
  assert.equal(closed, 1);
  assert.deepEqual(calls, []);
});

test('DNS persistente e outros erros nao gravam contagem e sempre fecham a pagina', async t => {
  t.mock.method(globalThis, 'setTimeout', callback => { callback(); });
  t.mock.method(console, 'warn', () => {});
  for (const [message, expectedAttempts] of [
    ['net::ERR_NAME_NOT_RESOLVED', 3],
    ['net::ERR_CERT_AUTHORITY_INVALID', 1],
  ]) {
    calls.length = 0;
    let attempts = 0;
    let closed = 0;
    const failure = new Error(message);
    const page = {
      goto: async () => { attempts++; throw failure; },
      close: async () => { closed++; },
    };
    await assert.rejects(contarAntesDasVendas({ newPage: async () => page }, { projeto: 'jfCrispi' }),
      error => expectedAttempts === 3
        ? /Falha de DNS.*crispiimoveis.com.br.*3 tentativas.*retorno preservado/.test(error.message) && error.cause === failure
        : error === failure);
    assert.equal(attempts, expectedAttempts);
    assert.equal(closed, 1);
    assert.deepEqual(calls, []);
  }
});

for (const [folder, collection] of [['crispi', 'jfCrispi'], ['speciale', 'jfSpeciale']]) {
  test(`${folder} fecha navegador e sinaliza falha quando a precontagem falha`, async () => {
    const source = fs.readFileSync(fileURLToPath(new URL(`../${folder}/index.js`, import.meta.url)), 'utf8');
    const sequence = [];
    const processStub = { cwd: () => '.', exit: () => assert.fail('process.exit impede finally') };
    const context = {
      COLLECTION_NAME: collection,
      ISOLATED_BACKEND_ROOT: '.',
      process: processStub,
      fs: { existsSync: () => true },
      path,
      console: { log: () => {}, error: () => {} },
      abrirBrowser: async options => {
        assert.equal(options.headlessOverride, true);
        return { close: async () => { sequence.push('close'); } };
      },
      contarAntesDasVendas: async () => { sequence.push('count'); throw new Error('DNS indisponivel'); },
      getCollectionAsMap: async () => assert.fail('nao deve carregar base'),
      sincronizarVendas: async () => assert.fail('nao deve salvar dados'),
    };
    await vm.runInNewContext(source.slice(source.indexOf('async function main()')), context);
    assert.deepEqual(sequence, ['count', 'close']);
    assert.equal(processStub.exitCode, 1);
  });
}

test('Oceanica desativada interrompe contagem sem timeout e sem gravar zero', async () => {
  calls.length = 0;
  const dom = new JSDOM('<h1>INFORME IMOBIBRASIL</h1>\n<p>Este site est&aacute; temporariamente desativado.</p>');
  const read = (callback, project) => {
    const previous = globalThis.document;
    globalThis.document = dom.window.document;
    try { return callback(project); }
    finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
  };
  let closed = 0;
  const project = projetoContagemVendas('nitOceanica');
  const page = {
    goto: async () => ({ status: () => 200 }),
    url: () => project.url,
    waitForFunction: async (callback, _options, config) => { assert.deepEqual(read(callback, config), { unavailable: true }); },
    evaluate: async (callback, config) => read(callback, config),
    close: async () => { closed++; },
  };
  try {
    await assert.rejects(contarAntesDasVendas({ newPage: async () => page }, { projeto: 'nitOceanica', salvar: false }),
      error => error.code === 'IMOBBRASIL_UNAVAILABLE' && /sem alterar dados/.test(error.message));
    assert.equal(closed, 1);
    assert.deepEqual(calls, []);
    dom.window.document.body.innerHTML = '<p>Carregando...</p>';
    assert.equal(read(lerContagemVendasDOM, project), false);
    dom.window.document.body.innerHTML = '<p class="topsearch__total">0 imoveis encontrados</p>';
    assert.equal(read(lerContagemVendasDOM, project).unavailable, undefined);
    assert.equal(parseTotalVendas(read(lerContagemVendasDOM, project).label, project), 0);
  } finally { dom.window.close(); }
});

test('AdMyHouse conta o novo catalogo Arbo e rejeita rota antiga e aluguel', async () => {
  const project = projetoContagemVendas('jfAdMyHouse');
  assert.equal(project.url, 'https://www.admyhouse.com.br/imoveis/a-venda/brasil?order=mais_relevantes');
  const dom = new JSDOM('<h1 class="Title_resultTitle__test">196 Imoveis a venda</h1>');
  const read = callback => {
    const previous = globalThis.document;
    globalThis.document = dom.window.document;
    try { return callback(project); }
    finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
  };
  let closed = false;
  const page = {
    goto: async url => { assert.equal(url, project.url); return { status: () => 200 }; },
    url: () => project.url,
    waitForFunction: async callback => { assert.ok(read(callback)); },
    evaluate: async callback => read(callback),
    close: async () => { closed = true; },
  };
  try {
    assert.equal(await contarAntesDasVendas({ newPage: async () => page }, { projeto: 'jfAdMyHouse', salvar: false }), 196);
    assert.equal(closed, true);
    dom.window.document.querySelector('h1').textContent = '5 Imoveis para alugar';
    assert.equal(read(lerContagemVendasDOM), false);
    assert.throws(() => validarUrlContagemVendas(project, 'https://www.admyhouse.com.br/imovel/venda'), /exclusiva/);
    assert.throws(() => validarUrlContagemVendas(project, project.url.replace('a-venda', 'para-alugar')), /exclusiva/);
  } finally { dom.window.close(); }
});

test('todos os 57 crawlers de jfora contam imediatamente depois de abrir navegador e antes da base', () => {
  const require = createRequire(import.meta.url);
  const { parse } = require('@babel/parser');
  const traverse = require('@babel/traverse').default;
  const root = fileURLToPath(new URL('../', import.meta.url));
  for (const project of projetosContagemVendas.filter(project => project.collection.startsWith('jf'))) {
    const source = fs.readFileSync(path.join(root, project.folder, 'index.js'), 'utf8');
    let countStart;
    let baseStart;
    let counts = 0;
    let syncs = 0;
    traverse(parse(source, { sourceType: 'module' }), {
      CallExpression(entry) {
        const { node } = entry;
        if (node.callee.name === 'getCollectionAsMap') baseStart = node.start;
        if (node.callee.name === 'contarAntesDasVendas' && !entry.findParent(parent => parent.isArrowFunctionExpression())) {
          countStart = node.start;
          counts++;
          assert.ok(entry.scope.getBinding('browser'), project.collection);
          assert.equal(node.arguments[1].properties.find(item => item.key.name === 'projeto').value.name, 'COLLECTION_NAME');
          const statement = entry.getStatementParent();
          const previous = statement.parentPath.node.body[statement.key - 1];
          assert.equal(previous?.expression?.left?.name, 'browser', `${project.collection}: contagem deve ser a primeira etapa depois de abrir navegador`);
          assert.equal(previous.expression.right?.argument?.callee?.name, 'abrirBrowser', project.collection);
        }
        if (node.callee.name === 'sincronizarVendas') {
          syncs++;
          const expected = node.arguments[0].properties.find(item => item.key.name === 'totalEsperado');
          assert.equal(expected.value.name, 'totalDisponivelVendas');
          assert.ok(entry.scope.getBinding(expected.value.name), project.collection);
          assert.ok(node.arguments[0].properties.some(item => item.key.name === 'vazioConfirmado'));
        }
      },
    });
    assert.equal(counts, 1, project.collection);
    assert.equal(syncs, 1, project.collection);
    assert.ok(countStart < baseStart, project.collection);
  }
});

test('inicio dos crawlers com fallback usa navegador aberto e falha de contagem impede base e raspagem', async () => {
  const require = createRequire(import.meta.url);
  const { parse } = require('@babel/parser');
  const traverse = require('@babel/traverse').default;
  const root = fileURLToPath(new URL('../', import.meta.url));
  const { USER_AGENT_TRIADE } = await import('../triade/extractor.js');
  let checked = 0;
  for (const project of projetosContagemVendas.filter(project => project.collection.startsWith('jf'))) {
    const source = fs.readFileSync(path.join(root, project.folder, 'index.js'), 'utf8');
    let opening;
    traverse(parse(source, { sourceType: 'module' }), {
      CallExpression(entry) {
        if (entry.node.callee.name === 'abrirBrowser' && entry.findParent(parent => parent.isForStatement())) opening = entry.getStatementParent();
      },
    });
    if (!opening) continue;
    const extraction = opening.parentPath.node.body.find(statement => statement.type === 'VariableDeclaration' && statement.declarations[0]?.init?.type === 'AwaitExpression' && statement.declarations[0].init.argument.callee?.name?.startsWith('extract'));
    assert.ok(extraction, project.collection);
    const extractor = extraction.declarations[0].init.argument.callee.name;
    const startup = source.slice(opening.node.start, extraction.end);
    for (const fail of [false, true]) {
      const sequence = [];
      const browser = {};
      const context = {
        console: { log: () => {} }, COLLECTION_NAME: project.collection, KEY_FIELD: 'linkReal', headlessOverride: false,
        USER_AGENT_TRIADE,
        browser: undefined, totalDisponivelVendas: undefined, existingDataMap: undefined, existingCodigoBaseSet: undefined,
        abrirBrowser: async () => { sequence.push('abrir'); return browser; },
        contarAntesDasVendas: async current => { assert.equal(current, browser); sequence.push('contar'); if (fail) throw new Error('Contagem indisponivel'); return 1; },
        getCollectionAsMap: async () => { sequence.push('base'); return new Map([['https://example.com/1', { codigoBase: '1' }]]); },
        [extractor]: async (current, codes) => { assert.equal(current, browser); assert.deepEqual([...codes], ['1']); sequence.push('raspar'); return { imoveisRaspados: [], novosImoveis: [] }; },
      };
      const result = vm.runInNewContext(`(async () => { ${startup} })()`, context);
      if (fail) {
        await assert.rejects(result, /Contagem indisponivel/);
        assert.deepEqual(sequence, ['abrir', 'contar'], project.collection);
      } else {
        await result;
        assert.deepEqual(sequence, ['abrir', 'contar', 'base', 'raspar'], project.collection);
      }
    }
    checked++;
  }
  assert.ok(checked > 0);
});

test('configuracoes cobrem os 93 projetos e rotas exclusivas de vendas sem faixas de preco', () => {
  assert.equal(projetosContagemVendas.length, 92);
  assert.equal(new Set(projetosContagemVendas.map(project => project.collection)).size, 92);
  for (const project of projetosContagemVendas) validarUrlContagemVendas(project, project.url);
  for (const project of projetosContagemVendas.filter(item => item.kind === 'padrao')) {
    assert.ok(!new URL(project.url).searchParams.get('preco_min'));
    assert.ok(!new URL(project.url).searchParams.get('preco_max'));
  }
});

for (const [name, label, total] of [
  ['jf1000Imoveis', 'Imoveis (1.234)', 1234], ['jfDecisao', '44 imoveis encontrados. Pagina 1', 44],
  ['jfCrispi', 'Exibindo 123 Imoveis a venda', 123], ['jfAcervo', '330 Imóveis à venda', 330],
  ['jfAcervo', '341 Imóveis à venda em Juiz De, Fora MG', 341],
  ['jfACasas', '1-12 de 36 resultados', 36], ['jfSoares', 'Encontramos 372 resultados para sua busca', 372],
  ['jfStart', '110 imoveis encontrados', 110], ['jfToc2', '33 Encontrados', 33],
  ['jfInvest', 'Venda - 1350 Imoveis encontrados', 1350], ['jfMega', '326', 326],
  ['jfInvest', 'Vendas - 1432 Imóveis encontrados', 1432],
  ['jfRemax', '1453 Número total de correspondências', 1453], ['jfCouto', '1 a 15 de 47 resultados', 47],
  ['jfOliveira', '78 opções encontrado(s)', 78], ['jfKantto', '671 resultados', 671],
  ['jfSouzaRocha', '1 para 6 fora de 24 imóveis', 24],
  ['jfHolder', 'Imóveis | à Venda | Foram encontrados 25 imóveis', 25],
  ['nitSiciliano', '62 Imóveis à venda encontrados', 62],
  ['nitGustavo', '2021', 2021],
  ['nitDrin', 'Encontramos 61 resultados para sua busca', 61],
  ['nitRealiza', '1141 Imóveis à venda em São Gonçalo e Região', 1141],
  ['nitRemax', '150 Número total de correspondências', 150],
]) {
  test(`${name} usa total anunciado, nao quantidade visivel ou numero de pagina`, () => {
    assert.equal(parseTotalVendas(label, projetoContagemVendas(name)), total);
    assert.throws(() => parseTotalVendas('Carregando', projetoContagemVendas(name)), /nao identificado/);
  });
}

test('precontagem grava antes de retornar e fecha pagina; falhas nao gravam zero', async () => {
  calls.length = 0;
  rows = [];
  const dom = new JSDOM('<div id="title--label">Imoveis (123)</div>');
  const page = {
    goto: async () => ({ status: () => 200 }), url: () => projetoContagemVendas('jf1000Imoveis').url,
    waitForFunction: async () => {},
    evaluate: async (callback, project) => {
      const previous = globalThis.document;
      globalThis.document = dom.window.document;
      try { return callback(project); } finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
    },
    close: async () => calls.push(['close']),
  };
  assert.equal(await contarAntesDasVendas({ newPage: async () => page }, { projeto: 'jf1000Imoveis', spreadsheetId: 'planilha-vendas' }), 123);
  assert.ok(calls.findIndex(([name]) => name === 'write') < calls.findIndex(([name]) => name === 'close'));
  for (const status of [403, 503]) {
    calls.length = 0;
    await assert.rejects(contarAntesDasVendas({ newPage: async () => ({ ...page, goto: async () => ({ status: () => status }) }) }, { projeto: 'jf1000Imoveis', spreadsheetId: 'planilha-vendas' }), /HTTP/);
    assert.ok(!calls.some(([name]) => name === 'write'));
    assert.ok(calls.some(([name]) => name === 'close'));
  }
  dom.window.close();
});

test('precontagem aguarda e tenta de novo apos HTTP 429 quando configurada', async () => {
  calls.length = 0;
  rows = [];
  const dom = new JSDOM('<div id="title--label">Imoveis (123)</div>');
  const statuses = [429, 429, 200];
  const page = {
    goto: async () => {
      const status = statuses.shift();
      return { status: () => status, headers: () => ({}) };
    },
    url: () => projetoContagemVendas('jf1000Imoveis').url,
    waitForFunction: async () => {},
    evaluate: async (callback, project) => {
      const previous = globalThis.document;
      globalThis.document = dom.window.document;
      try { return callback(project); } finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
    },
    close: async () => calls.push(['close']),
  };
  assert.equal(await contarAntesDasVendas({ newPage: async () => page }, { projeto: 'jf1000Imoveis', spreadsheetId: 'planilha-vendas', esperasBloqueioMs: [1, 1] }), 123);
  assert.equal(statuses.length, 0);

  const bloqueado = { ...page, goto: async () => ({ status: () => 429, headers: () => ({}) }) };
  await assert.rejects(
    contarAntesDasVendas({ newPage: async () => bloqueado }, { projeto: 'jf1000Imoveis', spreadsheetId: 'planilha-vendas', esperasBloqueioMs: [1] }),
    error => error.code === '1000IMOVEIS_BLOCKED'
  );
  dom.window.close();
});

test('RE/MAX conta pela API filtrada mesmo quando React normaliza a URL para negociacao -1', async t => {
  let filtered = false;
  let closed = false;
  let handler;
  let detached = false;
  const session = {
    on: (_name, listener) => { handler = listener; },
    off: (_name, listener) => { if (handler === listener) handler = undefined; },
    send: async () => {},
    detach: async () => { detached = true; },
  };
  const responseRecords = Array.from({ length: 24 }, (_, index) => ({ content: { ListingKey: `KEY-${index}` } }));
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.filter, 'content/CityID eq 6579324 and content/TransactionTypeUID eq 261');
    return {
      ok: true,
      json: async () => ({ '@odata.count': 1458, value: responseRecords }),
    };
  });
  const page = {
    createCDPSession: async () => session,
    goto: async (_url, options) => {
      filtered = options.waitUntil === 'networkidle2';
      await handler({
        requestId: 'filtered-search',
        request: {
          method: 'POST',
          postData: JSON.stringify({
            count: true, top: 24, skip: 0,
            filter: 'content/CityID eq 6579324 and content/TransactionTypeUID eq 261',
          }),
        },
      });
      return { status: () => 200 };
    },
    url: () => 'https://www.remax.com.br/listings?TransactionTypeUID=-1',
    waitForFunction: async () => {},
    evaluate: async () => false,
    close: async () => { closed = true; },
  };
  assert.equal(await contarAntesDasVendas({ newPage: async () => page }, { projeto: 'jfRemax', salvar: false }), 1458);
  assert.equal(filtered, true);
  assert.equal(closed, true);
  assert.equal(detached, true);
});

test('Decisao configura user-agent na precontagem e preserva falhas HTTP 403', async () => {
  const { USER_AGENT_DECISAO } = await import('../decisao/config.js');
  const require = createRequire(import.meta.url);
  const { parse } = require('@babel/parser');
  const traverse = require('@babel/traverse').default;
  const source = fs.readFileSync(new URL('../decisao/index.js', import.meta.url), 'utf8');
  let options;
  traverse(parse(source, { sourceType: 'module' }), {
    CallExpression({ node }) {
      if (node.callee.name !== 'contarAntesDasVendas') return;
      const argument = node.arguments[1];
      options = vm.runInNewContext(`(${source.slice(argument.start, argument.end)})`, {
        COLLECTION_NAME: 'jfDecisao', USER_AGENT_DECISAO,
      });
    },
  });
  assert.equal(options.userAgent, USER_AGENT_DECISAO);
  let userAgent;
  let status = 200;
  let closed = 0;
  const page = {
    setUserAgent: async value => { userAgent = value; },
    goto: async () => ({ status: () => userAgent === USER_AGENT_DECISAO ? status : 403 }),
    url: () => projetoContagemVendas('jfDecisao').url,
    waitForFunction: async () => {},
    evaluate: async () => ({ label: '135 imoveis encontrados. Pagina 1', confirmedEmpty: false, rentalStatus: false }),
    close: async () => { closed++; },
  };
  calls.length = 0;
  assert.equal(await contarAntesDasVendas({ newPage: async () => page }, { ...options, salvar: false }), 135);
  status = 403;
  await assert.rejects(contarAntesDasVendas({ newPage: async () => page }, options), error => error.code === 'DECISAO_BLOCKED');
  assert.equal(closed, 2);
  assert.ok(!calls.some(([name]) => ['write', 'batch'].includes(name)));
});

test('Fluxo usa na precontagem o user-agent do extrator e preserva bloqueios sem gravar', async () => {
  const { USER_AGENT_FLUXO } = await import('../fluxo/extractor.js');
  const require = createRequire(import.meta.url);
  const { parse } = require('@babel/parser');
  const traverse = require('@babel/traverse').default;
  const source = fs.readFileSync(new URL('../fluxo/index.js', import.meta.url), 'utf8');
  let options;
  traverse(parse(source, { sourceType: 'module' }), {
    CallExpression({ node }) {
      if (node.callee.name !== 'contarAntesDasVendas') return;
      const argument = node.arguments[1];
      options = vm.runInNewContext(`(${source.slice(argument.start, argument.end)})`, {
        COLLECTION_NAME: 'jfFluxo', USER_AGENT_FLUXO,
      });
    },
  });
  assert.equal(options.userAgent, USER_AGENT_FLUXO);
  let userAgent;
  let status = 200;
  let closed = 0;
  const page = {
    setUserAgent: async value => { userAgent = value; },
    goto: async () => ({ status: () => userAgent === USER_AGENT_FLUXO ? status : 403 }),
    url: () => projetoContagemVendas('jfFluxo').url,
    waitForFunction: async () => {},
    evaluate: async () => ({ label: '180 imoveis encontrados. Pagina 1', confirmedEmpty: false, rentalStatus: false }),
    close: async () => { closed++; },
  };
  calls.length = 0;
  assert.equal(await contarAntesDasVendas({ newPage: async () => page }, { ...options, salvar: false }), 180);
  for (status of [403, 429]) {
    await assert.rejects(contarAntesDasVendas({ newPage: async () => page }, options), error => error.code === 'FLUXO_BLOCKED');
  }
  assert.equal(closed, 3);
  assert.ok(!calls.some(([name]) => ['write', 'batch'].includes(name)));
});

test('Imperial configura user-agent na precontagem e preserva bloqueios sem gravar', async () => {
  const { USER_AGENT_IMPERIAL } = await import('../imperial/config.js');
  const require = createRequire(import.meta.url);
  const { parse } = require('@babel/parser');
  const traverse = require('@babel/traverse').default;
  const source = fs.readFileSync(new URL('../imperial/index.js', import.meta.url), 'utf8');
  let options;
  traverse(parse(source, { sourceType: 'module' }), {
    CallExpression({ node }) {
      if (node.callee.name !== 'contarAntesDasVendas') return;
      const argument = node.arguments[1];
      options = vm.runInNewContext(`(${source.slice(argument.start, argument.end)})`, {
        COLLECTION_NAME: 'jfImperial', USER_AGENT_IMPERIAL,
      });
    },
  });
  assert.equal(options.userAgent, USER_AGENT_IMPERIAL);
  let userAgent;
  let status = 200;
  let closed = 0;
  const page = {
    setUserAgent: async value => { userAgent = value; },
    goto: async () => ({ status: () => userAgent === USER_AGENT_IMPERIAL ? status : 403 }),
    url: () => projetoContagemVendas('jfImperial').url,
    waitForFunction: async () => {},
    evaluate: async () => ({ label: '347 imoveis encontrados. Pagina 1', confirmedEmpty: false, rentalStatus: false }),
    close: async () => { closed++; },
  };
  calls.length = 0;
  assert.equal(await contarAntesDasVendas({ newPage: async () => page }, { ...options, salvar: false }), 347);
  for (status of [403, 429]) {
    await assert.rejects(contarAntesDasVendas({ newPage: async () => page }, options), error => error.code === 'IMPERIAL_BLOCKED');
  }
  assert.equal(closed, 3);
  assert.ok(!calls.some(([name]) => ['write', 'batch'].includes(name)));
});

test('Positivo configura user-agent na precontagem e preserva bloqueios sem gravar', async () => {
  const { USER_AGENT_POSITIVO } = await import('../positivo/extractor.js');
  const require = createRequire(import.meta.url);
  const { parse } = require('@babel/parser');
  const traverse = require('@babel/traverse').default;
  const source = fs.readFileSync(new URL('../positivo/index.js', import.meta.url), 'utf8');
  let options;
  traverse(parse(source, { sourceType: 'module' }), {
    CallExpression({ node }) {
      if (node.callee.name !== 'contarAntesDasVendas') return;
      const argument = node.arguments[1];
      options = vm.runInNewContext(`(${source.slice(argument.start, argument.end)})`, {
        COLLECTION_NAME: 'jfPositivo', USER_AGENT_POSITIVO,
      });
    },
  });
  assert.equal(options.userAgent, USER_AGENT_POSITIVO);
  let userAgent;
  let status = 200;
  let closed = 0;
  const page = {
    setUserAgent: async value => { userAgent = value; },
    goto: async () => ({ status: () => userAgent === USER_AGENT_POSITIVO ? status : 403 }),
    url: () => projetoContagemVendas('jfPositivo').url,
    waitForFunction: async () => {},
    evaluate: async () => ({ label: '14 imoveis encontrados. Pagina 1', confirmedEmpty: false, rentalStatus: false }),
    close: async () => { closed++; },
  };
  calls.length = 0;
  assert.equal(await contarAntesDasVendas({ newPage: async () => page }, { ...options, salvar: false }), 14);
  for (status of [403, 429]) {
    await assert.rejects(contarAntesDasVendas({ newPage: async () => page }, options), error => error.code === 'POSITIVO_BLOCKED');
  }
  assert.equal(closed, 3);
  assert.ok(!calls.some(([name]) => ['write', 'batch'].includes(name)));
});

test('Fontes configura user-agent na precontagem e preserva bloqueios sem gravar', async () => {
  const { USER_AGENT_FONTES } = await import('../fontes/config.js');
  const require = createRequire(import.meta.url);
  const { parse } = require('@babel/parser');
  const traverse = require('@babel/traverse').default;
  const source = fs.readFileSync(new URL('../fontes/index.js', import.meta.url), 'utf8');
  let options;
  traverse(parse(source, { sourceType: 'module' }), {
    CallExpression({ node }) {
      if (node.callee.name !== 'contarAntesDasVendas') return;
      const argument = node.arguments[1];
      options = vm.runInNewContext(`(${source.slice(argument.start, argument.end)})`, {
        COLLECTION_NAME: 'jfFontes', USER_AGENT_FONTES,
      });
    },
  });
  assert.equal(options.userAgent, USER_AGENT_FONTES);
  let userAgent;
  let status = 200;
  let closed = 0;
  const page = {
    setUserAgent: async value => { userAgent = value; },
    goto: async () => ({ status: () => userAgent === USER_AGENT_FONTES ? status : 403 }),
    url: () => projetoContagemVendas('jfFontes').url,
    waitForFunction: async () => {},
    evaluate: async () => ({ label: '30 imoveis encontrados. Pagina 1', confirmedEmpty: false, rentalStatus: false }),
    close: async () => { closed++; },
  };
  calls.length = 0;
  assert.equal(await contarAntesDasVendas({ newPage: async () => page }, { ...options, salvar: false }), 30);
  for (status of [403, 429]) {
    await assert.rejects(contarAntesDasVendas({ newPage: async () => page }, options), error => error.code === 'FONTES_BLOCKED');
  }
  assert.equal(closed, 3);
  assert.ok(!calls.some(([name]) => ['write', 'batch'].includes(name)));
});

test('RV Negocios configura user-agent na precontagem e preserva bloqueios sem gravar', async () => {
  const { USER_AGENT_RVNEGOCIOS } = await import('../rvNegocios/extractor.js');
  const require = createRequire(import.meta.url);
  const { parse } = require('@babel/parser');
  const traverse = require('@babel/traverse').default;
  const source = fs.readFileSync(new URL('../rvNegocios/index.js', import.meta.url), 'utf8');
  let options;
  traverse(parse(source, { sourceType: 'module' }), {
    CallExpression({ node }) {
      if (node.callee.name !== 'contarAntesDasVendas') return;
      const argument = node.arguments[1];
      options = vm.runInNewContext(`(${source.slice(argument.start, argument.end)})`, {
        COLLECTION_NAME: 'jfRVNegocios', USER_AGENT_RVNEGOCIOS,
      });
    },
  });
  assert.equal(options.userAgent, USER_AGENT_RVNEGOCIOS);
  let userAgent;
  let status = 200;
  let closed = 0;
  const page = {
    setUserAgent: async value => { userAgent = value; },
    goto: async () => ({ status: () => userAgent === USER_AGENT_RVNEGOCIOS ? status : 403 }),
    url: () => projetoContagemVendas('jfRVNegocios').url,
    waitForFunction: async () => {},
    evaluate: async () => ({ label: '1115 imoveis encontrados. Pagina 1', confirmedEmpty: false, rentalStatus: false }),
    close: async () => { closed++; },
  };
  calls.length = 0;
  assert.equal(await contarAntesDasVendas({ newPage: async () => page }, { ...options, salvar: false }), 1115);
  for (status of [403, 429]) {
    await assert.rejects(contarAntesDasVendas({ newPage: async () => page }, options), error => error.code === 'RVNEGOCIOS_BLOCKED');
  }
  assert.equal(closed, 3);
  assert.ok(!calls.some(([name]) => ['write', 'batch'].includes(name)));
});

test('Triade usa na precontagem o mesmo user-agent do extrator e preserva falhas HTTP 403', async () => {
  const { USER_AGENT_TRIADE } = await import('../triade/extractor.js');
  const require = createRequire(import.meta.url);
  const { parse } = require('@babel/parser');
  const traverse = require('@babel/traverse').default;
  const source = fs.readFileSync(new URL('../triade/index.js', import.meta.url), 'utf8');
  let options;
  traverse(parse(source, { sourceType: 'module' }), {
    CallExpression({ node }) {
      if (node.callee.name === 'contarAntesDasVendas') {
        const argument = node.arguments[1];
        options = vm.runInNewContext(`(${source.slice(argument.start, argument.end)})`, {
          COLLECTION_NAME: 'jfTriade', USER_AGENT_TRIADE,
        });
      }
    },
  });
  assert.equal(options.userAgent, USER_AGENT_TRIADE);
  let userAgent;
  let status = 200;
  let closed = 0;
  const page = {
    setUserAgent: async value => { userAgent = value; },
    goto: async () => ({ status: () => userAgent === USER_AGENT_TRIADE ? status : 403 }),
    url: () => projetoContagemVendas('jfTriade').url,
    waitForFunction: async () => {},
    evaluate: async () => ({ label: '213 imoveis encontrados. Pagina 1.', confirmedEmpty: false, rentalStatus: false }),
    close: async () => { closed++; },
  };
  calls.length = 0;
  assert.equal(await contarAntesDasVendas({ newPage: async () => page }, { ...options, salvar: false }), 213);
  status = 403;
  await assert.rejects(contarAntesDasVendas({ newPage: async () => page }, options), error => error.code === 'TRIADE_BLOCKED');
  assert.equal(closed, 2);
  assert.ok(!calls.some(([name]) => ['write', 'batch'].includes(name)));
});

test('vendas grava Projeto e Quantidade no retorno da sua planilha sem tocar aluguel', async () => {
  calls.length = 0;
  rows = [];
  await registrarTotalVendas('jfTeste', 123, 'planilha-vendas');
  assert.deepEqual(calls.find(([name]) => name === 'ensure'), ['ensure', 'planilha-vendas', 'retorno', 3]);
  assert.deepEqual(calls.find(([name]) => name === 'header')[3], ['Projeto', 'Quantidade', "tipo"]);
  assert.deepEqual(calls.find(([name]) => name === 'write'), ['write', 'planilha-vendas', "'retorno'!A2:C2", [['jfTeste', 123, "venda"]]]);
});

test('vendas aceita colecoes de Niteroi, inclusive nomes com hifen', async () => {
  calls.length = 0;
  rows = [];
  await registrarTotalVendas('nitAccioly', 203, 'planilha-vendas');
  assert.deepEqual(calls.find(([name]) => name === 'batch'), ['batch', 'planilha-vendas', [{ range: "'retorno'!A2:C2", values: [['nitAccioly', 203, 'venda']] }]]);
});

test('contagem de vendas Rio usa sua planilha tanto individualmente quanto em lote', async () => {
  for (const registrar of [
    () => registrarTotalVendas('rioCasalta', 47),
    () => registrarTotaisVendas([{ projeto: 'rioCasalta', total: 47 }]),
  ]) {
    calls.length = 0;
    rows = [];
    await registrar();
    assert.deepEqual(calls.find(([name]) => name === 'ensure'), ['ensure', RIO_SPREADSHEET_ID, 'retorno', 3]);
    assert.deepEqual(calls.find(([name]) => name === 'write'), ['write', RIO_SPREADSHEET_ID, "'retorno'!A2:C2", [['rioCasalta', 47, 'venda']]]);
  }
});

test('vendas atualiza mesma linha, conserva outros projetos e rejeita destino aluguel', async () => {
  calls.length = 0;
  rows = [['Projeto', 'Quantidade'], ['jfOutra', 9], ['jfTeste', 123]];
  await registrarTotalVendas('jfTeste', 0, 'planilha-vendas');
  assert.deepEqual(calls.find(([name]) => name === 'write'), ['write', 'planilha-vendas', "'retorno'!A3:C3", [['jfTeste', 0, "venda"]]]);
  await assert.rejects(registrarTotalVendas('jfTesteLocacao', 1, 'planilha-vendas'), /invalido/);
  await assert.rejects(registrarTotalVendas('jfTeste', 1, '11MOUe5l8ICx8BJqoBbqCqmeSYNJwYhh7KDilzwoUnxk'), /diferente/);
  await assert.rejects(registrarTotalVendas('jfTeste', -1, 'planilha-vendas'), /invalido/);
});

test('contador de aluguel, valores negativos e redirecionamentos nao sao aceitos em vendas', () => {
  const kenlo = projetoContagemVendas('jfCrispi');
  assert.throws(() => parseTotalVendas('39 Imoveis para alugar', kenlo), /aluguel/);
  assert.throws(() => parseTotalVendas('-1 Imoveis a venda', kenlo), /nao identificado/);
  assert.throws(() => parseTotalVendas('1.2 Imoveis a venda', kenlo), /nao identificado/);
  assert.equal(parseTotalVendas('Exibindo 1.234 Imóveis à venda', kenlo), 1234);
  assert.throws(() => validarUrlContagemVendas(kenlo, kenlo.url.replace('a-venda', 'para-alugar')), /exclusiva/);
  assert.throws(() => validarUrlContagemVendas(kenlo, 'https://outro-site.com/imoveis/a-venda'), /outro site/);
});

test('lote evita quota com leitura e gravacao unicas, preservando projetos nao consultados', async () => {
  calls.length = 0;
  rows = [['Projeto', 'Quantidade'], ['jfOutra', 8], ['jfCrispi', 10]];
  await registrarTotaisVendas([{ projeto: 'jfCrispi', total: 303 }, { projeto: 'jfKantto', total: 671 }], 'planilha-vendas');
  assert.equal(calls.filter(([name]) => name === 'ensure').length, 1);
  assert.equal(calls.filter(([name]) => name === 'write').length, 2);
  assert.equal(calls.filter(([name]) => name === 'batch').length, 1);
  assert.deepEqual(calls.find(([name]) => name === 'batch')[2], [
    { range: "'retorno'!A3:C3", values: [['jfCrispi', 303, "venda"]] },
    { range: "'retorno'!A4:C4", values: [['jfKantto', 671, "venda"]] },
  ]);
});

test('Soares aguarda titulo de venda e cards em vez de gravar zero transitorio do Angular', () => {
  const dom = new JSDOM('<h1 class="destaque-titulo">372 Imóveis para Comprar</h1><p>Encontramos <span class="bold ng-binding">0</span> resultados para sua busca</p>');
  const previous = globalThis.document;
  globalThis.document = dom.window.document;
  try {
    const project = projetoContagemVendas('jfSoares');
    assert.equal(lerContagemVendasDOM(project), false);
    dom.window.document.querySelector('span').textContent = '372';
    assert.equal(lerContagemVendasDOM(project), false);
    dom.window.document.body.insertAdjacentHTML('beforeend', '<div class="box-imovel ng-scope"></div>');
    assert.ok(lerContagemVendasDOM(project));
    dom.window.document.querySelector('h1').textContent = '0 Imóveis para Comprar';
    dom.window.document.querySelector('span').textContent = '0';
    assert.ok(lerContagemVendasDOM(project));
  } finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; dom.window.close(); }
});

test('Soares recupera apenas busca inicial interrompida por Flickity ausente', () => {
  const dom = new JSDOM('<div ng-controller="Resultado2Controller"></div>');
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  let searches = 0;
  const scope = {
    primeiroCarregamento: true,
    buscandoImoveis: false,
    $apply: callback => callback(),
    atualizaImoveis: () => { searches++; scope.buscandoImoveis = true; },
  };
  dom.window.angular = { element: () => ({ scope: () => scope }) };
  dom.window.jQuery = { fn: {} };
  try {
    assert.equal(recuperarBuscaSoaresDOM(), true);
    assert.equal(searches, 1);
    assert.equal(recuperarBuscaSoaresDOM(), false);
    scope.buscandoImoveis = false;
    scope.primeiroCarregamento = false;
    assert.equal(recuperarBuscaSoaresDOM(), false);
    scope.primeiroCarregamento = true;
    dom.window.jQuery.fn.flickity = () => {};
    assert.equal(recuperarBuscaSoaresDOM(), false);
    assert.equal(searches, 1);
    delete dom.window.angular;
    assert.equal(recuperarBuscaSoaresDOM(), null);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    dom.window.close();
  }
});

test('Lider conta a pagina /imovel/venda e rejeita aluguel ou contador ausente', async () => {
  calls.length = 0;
  const project = projetoContagemVendas('jfLider');
  let heading = 'Imoveis Disponiveis, Venda';
  let label = '106 imoveis encontrados. Pagina 1';
  const read = callback => {
    const dom = new JSDOM(`<h1>${heading}</h1><p class="topsearch__total">${label}</p>`);
    const previous = globalThis.document;
    globalThis.document = dom.window.document;
    try { return callback(project); }
    finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; dom.window.close(); }
  };
  const page = {
    url: () => project.url,
    goto: async url => { assert.equal(url, 'https://www.lidernegociosimob.com.br/imovel/venda'); return { status: () => 200 }; },
    waitForFunction: async callback => { if (!read(callback)) throw new Error('Contagem ausente ou fora de vendas'); },
    evaluate: async callback => read(callback),
    close: async () => calls.push(['close']),
  };
  assert.equal(await contarAntesDasVendas({ newPage: async () => page }, { projeto: 'jfLider', spreadsheetId: 'planilha-vendas' }), 106);
  assert.deepEqual(calls.find(([name]) => name === 'write')[3], [['jfLider', 106, "venda"]]);
  calls.length = 0;
  heading = 'Imoveis para alugar';
  await assert.rejects(contarAntesDasVendas({ newPage: async () => page }, { projeto: 'jfLider', spreadsheetId: 'planilha-vendas' }), /fora de vendas/);
  heading = 'Imoveis Disponiveis, Venda';
  label = '';
  await assert.rejects(contarAntesDasVendas({ newPage: async () => page }, { projeto: 'jfLider', spreadsheetId: 'planilha-vendas' }), /Contagem ausente/);
  assert.ok(!calls.some(([name]) => name === 'write'));
  assert.throws(() => validarUrlContagemVendas(project, project.url.replace('/imovel/venda', '/imovel/locacao')), /exclusiva de venda/);
  assert.throws(() => validarUrlContagemVendas(project, project.url.replace('/imovel/venda', '/comprar')), /exclusiva de venda/);
});