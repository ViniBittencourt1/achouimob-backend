const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ORDEM_PROJETOS, ordenarProjetos, ordenarScripts, incluirAlugueisConfigurados, projetoHabilitadoNaRaspagem } = require('./crawler-order.cjs');

test('raspagem automatica exclui Acervo, Souza Gomes e Multimoveis, mantendo cadastro e demais projetos', () => {
  for (const name of ['acervo', 'acervo:locacao', 'souzagomes', 'souzagomes:locacao', 'jfAcervo', 'jfSouzaGomes:locacao', 'multimoveis', 'multimoveis:locacao', 'jfMultimoveis', 'jfMultimoveis:locacao']) {
    assert.equal(projetoHabilitadoNaRaspagem(name), false, name);
  }
  assert.ok(ORDEM_PROJETOS.includes('jfAcervo'));
  assert.ok(ORDEM_PROJETOS.includes('jfSouzaGomes'));
  assert.ok(ORDEM_PROJETOS.includes('jfMultimoveis'));
  assert.equal(projetoHabilitadoNaRaspagem('souzarocha:locacao'), true);
  assert.equal(projetoHabilitadoNaRaspagem('admyhouse'), true);
  assert.deepEqual(
    incluirAlugueisConfigurados(
      ['acervo', 'souzagomes:locacao', 'multimoveis', 'multimoveis:locacao', 'admyhouse'],
      ['acervo:locacao', 'souzagomes:locacao', 'multimoveis:locacao', 'admyhouse:locacao'],
    ),
    ['admyhouse', 'admyhouse:locacao'],
  );
});

test('ordem fixa contem 142 projetos unicos e organiza JF, Niteroi, Uba e Rio', () => {
  assert.equal(ORDEM_PROJETOS.length, 142);
  assert.equal(new Set(ORDEM_PROJETOS).size, 142);
  assert.deepEqual(ordenarProjetos([...ORDEM_PROJETOS].reverse()), ORDEM_PROJETOS);
  const primeiroNiteroi = ORDEM_PROJETOS.findIndex(name => name.startsWith('nit'));
  assert.ok(primeiroNiteroi > 0);
  assert.ok(ORDEM_PROJETOS.slice(0, primeiroNiteroi).every(name => name.startsWith('jf')));
  const primeiroUba = ORDEM_PROJETOS.findIndex(name => name.startsWith('uba'));
  assert.ok(ORDEM_PROJETOS.slice(primeiroNiteroi, primeiroUba).every(name => name.startsWith('nit')));
  const primeiroRio = ORDEM_PROJETOS.findIndex(name => name.startsWith('rio'));
  assert.ok(ORDEM_PROJETOS.slice(primeiroUba, primeiroRio).every(name => name.startsWith('uba')));
  assert.ok(ORDEM_PROJETOS.slice(primeiroRio).every(name => name.startsWith('rio')));
  const sales = ORDEM_PROJETOS.map(name => (name.startsWith('jf') ? name.slice(2) : name).toLowerCase().replace('rvnegocios', 'rv'));
  assert.deepEqual(ordenarScripts([...sales].reverse()), sales);
  assert.deepEqual(ordenarScripts([...sales].reverse().map(name => `${name}:locacao`)), sales.map(name => `${name}:locacao`));
});

test('selecao parcial agrupa venda e aluguel por imobiliaria sem modificar a entrada', () => {
  const names = ['mega:locacao', 'rv:locacao', 'select:locacao', '1000imoveis:locacao', 'universal:locacao', 'select:locacao'];
  const original = [...names];
  assert.deepEqual(ordenarScripts(names), ['1000imoveis:locacao', 'universal:locacao', 'select:locacao', 'rv:locacao', 'mega:locacao']);
  assert.deepEqual(names, original);
  assert.deepEqual(
    ordenarScripts(['nitkiffer:locacao', 'nitkiffer', 'mega:locacao', 'mega']),
    ['mega', 'mega:locacao', 'nitkiffer', 'nitkiffer:locacao'],
  );
  assert.deepEqual(ordenarScripts(['typesense:sync', 'mega', 'crispi', 'audit']), ['crispi', 'mega', 'typesense:sync', 'audit']);
});

test('projetos selecionados incluem aluguel apenas quando existe script correspondente', () => {
  assert.deepEqual(
    incluirAlugueisConfigurados(
      ['nitkiffer', '1000imoveis', 'project-without-rental'],
      ['nitkiffer:locacao', '1000imoveis:locacao'],
    ),
    ['1000imoveis', '1000imoveis:locacao', 'nitkiffer', 'nitkiffer:locacao', 'project-without-rental'],
  );
  assert.deepEqual(
    incluirAlugueisConfigurados(['1000imoveis', '1000imoveis:locacao'], ['1000imoveis:locacao']),
    ['1000imoveis', '1000imoveis:locacao'],
  );
});

test('executor diario aplica ordem e inclui alugueis tanto em SCRAPE_SCRIPTS quanto na configuracao salva', () => {
  const source = fs.readFileSync(path.join(__dirname, 'render-daily.js'), 'utf8');
  const start = source.indexOf('function loadSelectedScripts()');
  const end = source.indexOf('function runScript(', start);
  const packageScripts = Object.fromEntries(['mega', 'rv', 'select', '1000imoveis', 'universal']
    .map(name => [`${name}:locacao`, '']));
  const expected = ['1000imoveis', '1000imoveis:locacao', 'universal', 'universal:locacao', 'select', 'select:locacao', 'rv', 'rv:locacao', 'mega', 'mega:locacao'];
  for (const fromEnv of [true, false]) {
    const scripts = ['mega', 'rv', 'select', '1000imoveis', 'universal', 'typesense:sync', 'acervo', 'souzagomes', 'acervo:locacao', 'souzagomes:locacao', 'multimoveis', 'multimoveis:locacao'];
    const context = vm.createContext({
      process: { env: { SCRAPE_SCRIPTS: fromEnv ? scripts.join(',') : '' } },
      fs: {
        readFileSync: file => String(file) === path.join('backend', 'package.json')
          ? JSON.stringify({ scripts: packageScripts })
          : JSON.stringify({ selectedScripts: scripts }),
      },
      path, backendRoot: 'backend', configPath: 'config',
      MANUAL_ONLY_SCRIPTS: new Set(['typesense:sync']), incluirAlugueisConfigurados,
    });
    vm.runInContext(source.slice(start, end), context);
    assert.deepEqual(Array.from(vm.runInContext('loadSelectedScripts()', context)), expected);
  }
});

test('executores de grupos e contagem usam ordem compartilhada antes dos loops', () => {
  for (const file of ['locacaoPadrao.js', 'locacaoImobBrasil.js', 'locacaoKenlo.js', 'locacaoDiversos.js']) {
    const source = fs.readFileSync(path.join(__dirname, '_01extractor/crawlers/jfora/_utils', file), 'utf8');
    const main = source.slice(source.indexOf('export async function main('));
    assert.ok(main.includes('ordenarProjetos('), file);
    assert.ok(main.indexOf('ordenarProjetos(') < main.indexOf('for (' ) || main.indexOf('ordenarProjetos(') < main.indexOf('for('), file);
  }
  const source = fs.readFileSync(path.join(__dirname, 'contar-vendas.js'), 'utf8');
  assert.ok(source.indexOf('ordenarProjetos(args.') < source.indexOf('for (const project of projects)'));
});