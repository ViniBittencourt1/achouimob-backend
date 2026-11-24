import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { extractCorretor } from './extractor-16-corretor.js';
import { scrapeFranquias } from './extractor-00-rotaInterna.js';

test('RE/MAX extrai Remax Elos do link de escritorio informado', () => {
  const html = '<p class="MuiTypography-root MuiTypography-body2 text-align-left body2 secondary-text css-1aq0tvz"><a class="MuiTypography-root MuiTypography-inherit MuiLink-root MuiLink-underlineHover text-align-left secondary-text css-1vxruma" title="REMAX ELOS" aria-label="REMAX ELOS" href="pt-br/escritorios/minas-gerais/juiz-de-fora/remax-elos/86028">REMAX ELOS</a></p>';
  assert.equal(extractCorretor(html), 'Remax Elos');
});

test('RE/MAX extrai outras franquias sem depender da classe CSS', () => {
  assert.equal(extractCorretor('<a href="/pt-br/escritorios/minas-gerais/juiz-de-fora/remax-premium/86043">\n REMAX   PREMIUM \n</a>'), 'Remax Premium');
  assert.equal(extractCorretor('<a href="https://www.remax.com.br/pt-br/escritorios/minas-gerais/juiz-de-fora/remax-elos/86028" title="REMAX ELOS"></a>'), 'Remax Elos');
});

test('RE/MAX nao usa nome do agente, menu ou dominio externo como franquia', () => {
  const html = '<a href="/pt-br/escritorios/">Escritorios</a><a href="/pt-br/agentes/123">Nome do agente</a><a href="https://example.com/pt-br/escritorios/mg/jf/remax/86028">EXTERNO</a>';
  assert.equal(extractCorretor(html), '');
  assert.equal(extractCorretor(), '');
});

test('rota interna preenche franquia em vendas e alugueis preservando foto e preco', async () => {
  const imoveis = [
    { linkReal: 'https://www.remax.com.br/pt-br/imoveis/casa/comprar/jf/1', corretor: 'Remax', preco: 345000, linkFoto: 'foto-venda' },
    { linkReal: 'https://www.remax.com.br/pt-br/imoveis/casa/alugar/jf/2', corretor: 'Remax', preco: 1900, linkFoto: 'foto-aluguel' },
  ];
  let current;
  let closed = false;
  const page = {
    goto: async url => { current = url; return { ok: () => true }; },
    waitForFunction: async () => {},
    content: async () => `<p><a href="/pt-br/escritorios/mg/jf/franquia/86028">${current.includes('comprar') ? 'REMAX ELOS' : 'REMAX PREMIUM'}</a></p>`,
    close: async () => { closed = true; },
  };
  await scrapeFranquias({ newPage: async () => page }, imoveis);
  assert.deepEqual(imoveis.map(imovel => imovel.corretor), ['Remax Elos', 'Remax Premium']);
  assert.deepEqual(imoveis.map(imovel => imovel.preco), [345000, 1900]);
  assert.deepEqual(imoveis.map(imovel => imovel.linkFoto), ['foto-venda', 'foto-aluguel']);
  assert.equal(closed, true);
});

test('rota interna nao substitui franquia ausente por valor fixo e fecha pagina', async () => {
  let closed = false;
  const page = { goto: async () => ({ ok: () => true }), waitForFunction: async () => {}, content: async () => '<p>Sem escritorio</p>', close: async () => { closed = true; } };
  await assert.rejects(scrapeFranquias({ newPage: async () => page }, [{ linkReal: 'https://www.remax.com.br/imovel/teste' }]), /Franquia RE\/MAX nao identificada/);
  assert.equal(closed, true);
});

test('links existentes formatam corretor salvo e nao abrem pagina interna', async () => {
  const imoveis = [{ linkReal: 'https://www.remax.com.br/imovel/1', corretor: '' }, { linkReal: 'https://www.remax.com.br/imovel/2', corretor: '' }];
  const anteriores = new Map([[imoveis[0].linkReal, { corretor: 'REMAX ELOS' }], [imoveis[1].linkReal, { corretor: 'Remax' }]]);
  await scrapeFranquias({ newPage: async () => assert.fail('Nao abrir pagina para links existentes') }, imoveis, anteriores);
  assert.deepEqual(imoveis.map(imovel => imovel.corretor), ['Remax Elos', 'Remax']);
  assert.equal(anteriores.get(imoveis[0].linkReal).corretor, 'REMAX ELOS');
});

test('somente link novo visita rota interna quando a lista mistura novos e existentes', async () => {
  const imoveis = [{ linkReal: 'https://www.remax.com.br/imovel/1', corretor: '' }, { linkReal: 'https://www.remax.com.br/imovel/2', corretor: '' }];
  const anteriores = new Map([[imoveis[0].linkReal, { corretor: 'REMAX ELOS' }]]);
  const visits = [];
  const page = {
    goto: async url => { visits.push(url); return { ok: () => true }; },
    waitForFunction: async () => {}, content: async () => '<a href="/pt-br/escritorios/mg/jf/remax-spazio/86021">REMAX SPAZIO</a>', close: async () => {},
  };
  await scrapeFranquias({ newPage: async () => page }, imoveis, anteriores);
  assert.deepEqual(visits, [imoveis[1].linkReal]);
  assert.deepEqual(imoveis.map(imovel => imovel.corretor), ['Remax Elos', 'Remax Spazio']);
});

test('extrator principal visita apenas novos links em vendas e alugueis', async () => {
  const source = fs.readFileSync(new URL('./extractor.js', import.meta.url), 'utf8');
  const start = source.indexOf('export async function extractRemaxData');
  for (const options of [{ negociacao: 'venda', totalEsperado: 1 }, { negociacao: 'locacao', baseUrl: 'https://www.remax.com.br/listings?TransactionTypeUID=260' }]) {
    for (const cached of [false, true]) {
    const link = 'https://www.remax.com.br/pt-br/imoveis/casa/alugar/jf/1';
    const existingDataMap = cached ? new Map([[link, { corretor: 'REMAX SPAZIO' }]]) : new Map();
    const writes = [];
    let pages = 0;
    let apiCalls = 0;
    const browser = { newPage: async () => {
      pages++;
      return { goto: async () => ({ ok: () => true }), waitForFunction: async () => {}, close: async () => {}, content: async () => '<a href="/pt-br/escritorios/mg/jf/remax-elos/86028">REMAX ELOS</a>' };
    } };
    const context = vm.createContext({
      BASE_URL: 'https://www.remax.com.br/listings?TransactionTypeUID=261',
      scrapeListingPage: async () => [{ linkReal: link, preco: 1900, linkFoto: 'foto-listagem', corretor: '' }],
      scrapeFranquias, path, process: { cwd: () => 'diretorio-simulado' },
      installRemaxSearchBatches: async () => {
        apiCalls++;
        return { waitUntilReady: async () => 1, assertHealthy: () => {}, close: async () => {} };
      },
      fs: { existsSync: () => true, mkdirSync: () => {}, writeFileSync: (_file, data) => writes.push(JSON.parse(data)) },
      console: { log: () => {} },
    });
    vm.runInContext(source.slice(start).replace(/^export /, ''), context);
    const result = await context.extractRemaxData(browser, { ...options, existingDataMap });
    const expected = cached ? 'Remax Spazio' : 'Remax Elos';
    assert.equal(result.imoveisRaspados[0].corretor, expected);
    assert.equal(pages, cached ? 1 : 2);
    assert.equal(apiCalls, ['venda', 'locacao'].includes(options.negociacao) ? 1 : 0);
    assert.equal(writes.length, 0);
    if (writes.length) assert.equal(writes[0][0].corretor, expected);
    }
  }
});

test('cache dos controladores usa o JSON separado de cada modalidade', () => {
  const sales = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  const rentals = fs.readFileSync(new URL('./locacao.js', import.meta.url), 'utf8');
  assert.ok(sales.includes("crawler/jfRemax.json"));
  assert.ok(sales.includes('existingDataMap: franquiasSalvas'));
  assert.ok(rentals.includes('crawler/jfRemaxLocacao.json'));
  assert.ok(rentals.includes('existingDataMap: existingMap'));
});