const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { formatarNomeRemax } = require('./formatarNomeRemax.cjs');
const { projectImovelForTypesense } = require('./_02utils/typesense/projectImovelForTypesense.cjs');
const { publicationProfile } = require('./publication-profiles.cjs');

const frontendSource = fs.readFileSync(require.resolve('../frontend/js/formatarNomeRemax.js'), 'utf8');
const formatarFrontend = vm.runInNewContext(frontendSource.replace('export function', 'function') + '\nformatarNomeRemax;');
const cases = [
  ['REMAX LIBERTY', 'Remax Liberty'],
  ['REMAX ELOS', 'Remax Elos'],
  ['RE/MAX PREMIUM', 'Remax Premium'],
  ['  remax   sÃO pEDRO  ', 'Remax São Pedro'],
  ['REMAX ALTO-PADRÃO', 'Remax Alto-Padrão'],
  ['Remax Liberty', 'Remax Liberty'],
  ['REMAX', 'Remax'],
  ['RE/MAX', 'Remax'],
  ['SouzaGomes', 'SouzaGomes'],
  ['RV NEGOCIOS', 'RV NEGOCIOS'],
  ['  Outra Imobiliaria  ', '  Outra Imobiliaria  '],
  ['REMAXIMUM', 'REMAXIMUM'],
  ['', ''],
  [null, null],
  [undefined, undefined],
];

for (const [input, expected] of cases) test(`formata somente Remax: ${input}`, () => {
  assert.equal(formatarNomeRemax(input), expected);
  assert.equal(formatarFrontend(input), expected);
  assert.equal(formatarNomeRemax(expected), expected);
});

test('Typesense formata dados antigos de vendas e alugueis sem alterar origem ou identidade', () => {
  for (const negociacao of ['venda', 'locacao']) {
    const original = { id: 'id-1', corretor: 'REMAX LIBERTY', linkReal: 'https://example.com/1', codigoBase: '123', preco: 1000, negociacao };
    const projected = projectImovelForTypesense(original);
    assert.equal(projected.corretor, 'Remax Liberty');
    for (const key of ['id', 'linkReal', 'codigoBase', 'preco', 'negociacao']) assert.equal(projected[key], original[key]);
    assert.equal(original.corretor, 'REMAX LIBERTY');
  }
});

test('Firestore formata nomes de ambos os perfis e preserva ids publicos', async () => {
  const { buildPublicDocs } = await import('./publish-crawler-json.js');
  for (const tipo of ['vendas', 'alugueis']) {
    const record = { corretor: 'REMAX LIBERTY', linkReal: 'https://example.com/1', codigoBase: '123', preco: 1000 };
    const profile = publicationProfile(tipo);
    const docs = buildPublicDocs(new Map([['jfRemax', [record]]]), profile, '2026-10-15');
    const formatted = buildPublicDocs(new Map([['jfRemax', [{ ...record, corretor: 'Remax Liberty' }]]]), profile, '2026-10-15');
    assert.equal(docs[0].data.corretor, 'Remax Liberty');
    assert.deepEqual(docs, formatted);
    assert.equal(record.corretor, 'REMAX LIBERTY');
  }
});

test('Sheets normaliza registros antigos antes do envio', async () => {
  const source = fs.readFileSync(require.resolve('./_01extractor/crawlers/jfora/remax/sheets.js'), 'utf8')
    .replace(/^import .+;\r?$/gm, '').replace('export async function', 'async function');
  const writes = [];
  const exportToSheets = vm.runInNewContext(source + '\nexportToSheets;', {
    nomesRemax: { formatarNomeRemax },
    process: { env: {} }, console: { log() {}, warn() {} },
    clearSheet: async () => {}, writeHeader: async () => {},
    writeSheet: async (_id, _range, rows) => writes.push(rows),
  });
  await exportToSheets([{ corretor: 'REMAX LIBERTY', preco: 1000 }], { spreadsheetId: 'local-test' });
  assert.equal(writes[0][0][15], 'Remax Liberty');
  assert.equal(writes[0][0][2], 1000);
});

test('busca do frontend apresenta nomes antigos do Typesense no novo formato', async () => {
  const source = fs.readFileSync(require.resolve('../frontend/_search/fetchImoveisTypesense.js'), 'utf8')
    .replace(/^import .+;\r?$/gm, '').replace(/^export /gm, '');
  const document = { id: 'legacy', corretor: 'REMAX LIBERTY', preco: 100000, linkReal: 'https://example.com/1' };
  const fetchImoveisTypesense = vm.runInNewContext(source + '\nfetchImoveisTypesense;', {
    formatarNomeRemax: formatarFrontend,
    URLSearchParams,
    console: { log() {}, error() {} },
    fetch: async () => ({ ok: true, json: async () => ({ hits: [{ document }], found: 1 }) }),
  });
  const response = await fetchImoveisTypesense({ sort: 'preco-asc' });
  assert.equal(response.items[0].corretor, 'Remax Liberty');
  assert.equal(response.items[0].id, 'legacy');
  assert.equal(document.corretor, 'REMAX LIBERTY');
});

test('cards de login e ebook formatam nomes vindos de favoritos antigos', () => {
  const cards = fs.readFileSync(require.resolve('../frontend/login/js/resultadosCards.js'), 'utf8');
  const ebook = fs.readFileSync(require.resolve('../frontend/busca/index-ebook.html'), 'utf8');
  assert.ok(cards.includes('${formatarNomeRemax(r.corretor)}'));
  assert.ok(ebook.includes('${formatarNomeRemax(imovel.corretor)}'));
});
