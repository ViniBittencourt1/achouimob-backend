import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const source = fs.readFileSync(new URL('./jfora.js', import.meta.url), 'utf8');
const start = source.indexOf('function normalizeBairroCatalogText(');
const end = source.indexOf('function loadBairroCatalog(', start);
const resolve = vm.runInNewContext(source.slice(start, end) + '\nresolveBairroSlugFromRawValue;');
const catalog = {
  byCity: new Map([
    ['niteroi-rj', [
      { nome: 'Condomínio Jardim Ubá', slug: 'jardim-uba', principal: 'nao' },
      { nome: 'Jardim Ubá', slug: 'jardim-uba', principal: 'sim' },
      { nome: 'Ica', slug: 'icarai', principal: 'nao' },
      { nome: 'Icaraí', slug: 'icarai', principal: 'sim' },
    ]],
    ['outra-rj', [{ nome: 'Ica', slug: 'outro-slug', principal: 'sim' }]],
  ]),
};

test('variantes nao principais resolvem para o slug, sem trocar o nome cadastrado', () => {
  assert.equal(resolve('Condomínio Jardim Ubá', 'niteroi-rj', catalog), 'jardim-uba');
  assert.equal(resolve('CONDOMINIO JARDIM UBA', 'niteroi-rj', catalog), 'jardim-uba');
  assert.equal(resolve('Ica', 'niteroi-rj', catalog), 'icarai');
  assert.equal(resolve('bairro atual: Ica', 'niteroi-rj', catalog), 'icarai');
  assert.equal(catalog.byCity.get('niteroi-rj')[0].principal, 'nao');
});

test('nome principal e slug continuam validos, com isolamento por cidade', () => {
  assert.equal(resolve('Jardim Ubá', 'niteroi-rj', catalog), 'jardim-uba');
  assert.equal(resolve('jardim-uba', 'niteroi-rj', catalog), 'jardim-uba');
  assert.equal(resolve('Ica', 'outra-rj', catalog), 'outro-slug');
  assert.equal(resolve('Ica', 'inexistente', catalog), '');
  assert.equal(resolve('', 'niteroi-rj', catalog), '');
  assert.equal(resolve('Desconhecido', 'niteroi-rj', catalog), '');
});

test('variante sem nome principal ainda pode normalizar o registro', () => {
  const onlyAlias = { byCity: new Map([['cidade', [{ nome: 'Valor raspado', slug: 'destino', principal: 'nao' }]]]) };
  assert.equal(resolve('Valor raspado', 'cidade', onlyAlias), 'destino');
});

test('valores ambiguos nao escolhem arbitrariamente o primeiro slug', () => {
  const ambiguous = { byCity: new Map([['cidade', [
    { nome: 'Mesmo Nome', slug: 'um', principal: 'nao' },
    { nome: 'Mesmo Nome', slug: 'dois', principal: 'nao' },
  ]]]) };
  assert.equal(resolve('Mesmo Nome', 'cidade', ambiguous), '');
});

test('painel reconhece variantes mas oferece somente principais na selecao', () => {
  const handler = source.slice(source.indexOf('app.get("/api/bairro-json-issues"'), source.indexOf('app.post("/api/bairro-json-issues/resolve"'));
  assert.ok(handler.includes('resolveBairroSlugFromRawValue(bairroOriginal, cidade, { byCity })'));
  assert.ok(handler.includes('keySet.has(`${bairro}__${cidade}`)'));
  assert.ok(handler.includes('Array.from(byCityPrincipal.entries())'));
});

test('filtro Typesense escolhe principal por cidade mesmo quando variante vem antes', () => {
  const migration = fs.readFileSync(new URL('../../../../_02utils/typesense/migrateImoveisToTypesense.cjs', import.meta.url), 'utf8');
  const line = migration.match(/const bairroInfo = bairrosData\.find\([^\n]+/)[0];
  const lookup = vm.runInNewContext(`(bairrosData, doc, cidadeSlugDoc) => { ${line} return bairroInfo; }`);
  const rows = [
    { nome: 'Valor raspado', slug: 'jardim-uba', cidade: 'niteroi-rj', principal: 'nao' },
    { nome: 'Bairro de outra cidade', slug: 'jardim-uba', cidade: 'outra-rj', principal: 'sim' },
    { nome: 'Jardim Ubá', slug: 'jardim-uba', cidade: 'niteroi-rj', principal: 'sim' },
  ];
  assert.equal(lookup(rows, { bairro: 'jardim-uba' }, 'niteroi-rj').nome, 'Jardim Ubá');
  assert.equal(lookup(rows.slice(0, 1), { bairro: 'jardim-uba' }, 'niteroi-rj'), undefined);
});

test('gravacao do catalogo bloqueia registros repetidos e dois principais antes de escrever', () => {
  const start = source.indexOf('function writeBairroCatalog(');
  const end = source.indexOf('function writeCityCatalog(', start);
  const writes = [];
  const write = vm.runInNewContext(source.slice(start, end) + '\nwriteBairroCatalog;', {
    fs: { writeFileSync: (...args) => writes.push(args) },
    bairrosCatalogoPath: 'catalogo.json',
    cachedBairroCatalog: null,
    cachedBairroCatalogMtime: 0,
    isPrincipal: item => String(item?.principal || 'sim').trim().toLowerCase() === 'sim',
  });
  const main = { cidade: 'uba-mg', slug: 'jardim-gloria', nome: 'Jardim Gloria', principal: 'sim' };
  assert.throws(() => write([main, { ...main, principal: 'nao' }]), /Bairro repetido/);
  assert.throws(() => write([main, { ...main, nome: 'Colina do Jardim Gloria' }]), /Mais de um bairro principal/);
  assert.equal(writes.length, 0);
  write([main, { ...main, nome: 'Colina do Jardim Gloria', principal: 'nao' }, { ...main, cidade: 'outra-mg' }]);
  assert.equal(writes.length, 1);
});

test('catalogo atual nao possui registros repetidos nem principais duplicados por cidade', () => {
  const rows = JSON.parse(fs.readFileSync(new URL('../../../../_03database/filtros/_jfBairros.json', import.meta.url), 'utf8'));
  const identities = new Set();
  const principals = new Set();
  for (const row of rows) {
    const identity = JSON.stringify([row.cidade, row.slug, row.nome]);
    assert.ok(!identities.has(identity), `Registro duplicado: ${identity}`);
    identities.add(identity);
    if (String(row.principal || 'sim').toLowerCase() === 'sim') {
      const key = JSON.stringify([row.cidade, row.slug]);
      assert.ok(!principals.has(key), `Principal duplicado: ${key}`);
      principals.add(key);
    }
  }
});

test('bairros revisados no Excel resolvem aliases apenas nas respectivas cidades', () => {
  const rows = JSON.parse(fs.readFileSync(new URL('../../../../_03database/filtros/_jfBairros.json', import.meta.url), 'utf8'));
  const byCity = new Map();
  for (const row of rows) {
    if (!byCity.has(row.cidade)) byCity.set(row.cidade, []);
    byCity.get(row.cidade).push(row);
  }
  const revised = { byCity };
  for (const [cidade, original, target] of [
    ['astolfo-dutra-mg', 'belle-ville-ii', 'belle-ville'],
    ['campestre-mg', 'belevile-2', 'belle-ville'],
    ['divinesia-mg', 'cedro-do-libano-3', 'cedro-do-libano'],
    ['uba-mg', 'colina-do-jardim-gloria', 'jardim-gloria'],
    ['uba-mg', 'cond-jardim-manacas', 'jardim-manacas'],
    ['uba-mg', 'jd-esperanca-tanquinho', 'tanquinho'],
    ['general-carneiro-mt', 'rural', 'zona-rural'],
    ['tocantins-mg', 'bairro-branco', 'branco'],
  ]) assert.equal(resolve(original, cidade, revised), target);
  assert.equal(resolve('belevile-2', 'uba-mg', revised), '');
});
