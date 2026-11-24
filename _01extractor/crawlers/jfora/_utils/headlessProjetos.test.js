import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;

function expression(file, select) {
  const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
  let result;
  traverse(parse(source, { sourceType: 'module' }), {
    enter({ node }) {
      const selected = select(node);
      if (selected) result = source.slice(selected.start, selected.end);
    },
  });
  assert.ok(result, file);
  return result;
}

const opening = node => node.type === 'CallExpression' && node.callee.name === 'abrirBrowser' && node.arguments[0];
const modes = name => node => node.type === 'VariableDeclarator' && node.id.name === name && node.init;
const evaluate = (source, context) => JSON.parse(JSON.stringify(vm.runInNewContext(`(${source})`, context)));

test('Moura e Triade vendas nao abrem janela', () => {
  assert.deepEqual(evaluate(expression('../moura/index.js', opening)), { headlessOverride: true });
  assert.deepEqual(evaluate(expression('../triade/index.js', modes('modosHeadlessTentativa'))), [true]);
});

test('locacao Moura, Crispi, Nunes e VivaBem ignoram .env sem alterar os demais projetos Kenlo', () => {
  const source = expression('./locacaoKenlo.js', opening);
  assert.deepEqual(evaluate(source, { projeto: { collection: 'jfMoura' } }), { headlessOverride: true });
  assert.deepEqual(evaluate(source, { projeto: { collection: 'jfCrispi' } }), { headlessOverride: true });
  assert.deepEqual(evaluate(source, { projeto: { collection: 'jfNunes' } }), { headlessOverride: true });
  assert.deepEqual(evaluate(source, { projeto: { collection: 'jfVivaBem' } }), { headlessOverride: true });
  assert.equal(vm.runInNewContext(`(${source})`, { projeto: { collection: 'jfGm' } }), undefined);
});

test('Crispi vendas e rota externa abrem somente navegador headless', () => {
  assert.deepEqual(evaluate(expression('../crispi/index.js', opening)), { headlessOverride: true });
  const launch = node => node.type === 'CallExpression' && node.callee.object?.name === 'puppeteer'
    && node.callee.property?.name === 'launch' && node.arguments[0];
  assert.deepEqual(evaluate(expression('../crispi/extractor-00-rotaExterna.js', launch)), { headless: true });
});

test('Nunes vendas e rota externa abrem somente navegador headless', () => {
  assert.deepEqual(evaluate(expression('../nunes/index.js', opening)), { headlessOverride: true });
  const launch = node => node.type === 'CallExpression' && node.callee.object?.name === 'puppeteer'
    && node.callee.property?.name === 'launch' && node.arguments[0];
  assert.deepEqual(evaluate(expression('../nunes/extractor-00-rotaExterna.js', launch)), { headless: true });
});

test('VivaBem vendas e rota externa abrem somente navegador headless', () => {
  assert.deepEqual(evaluate(expression('../vivaBem/index.js', opening)), { headlessOverride: true });
  const launch = node => node.type === 'CallExpression' && node.callee.object?.name === 'puppeteer'
    && node.callee.property?.name === 'launch' && node.arguments[0];
  assert.deepEqual(evaluate(expression('../vivaBem/extractor-00-rotaExterna.js', launch)), { headless: true });
});

test('locacao Triade, Fluxo, Imperial, Positivo, RV e Fontes nunca usam fallback visivel e preservam os demais projetos', () => {
  const source = expression('./locacaoImobBrasil.js', modes('modos'));
  for (const collection of ['jfTriade', 'jfFluxo', 'jfImperial', 'jfPositivo', 'jfRVNegocios', 'jfFontes']) {
    for (const value of ['true', 'false', undefined]) {
      assert.deepEqual(evaluate(source, {
        projeto: { collection }, process: { env: { CRAWLER_HEADLESS: value } },
      }), [true]);
    }
  }
  assert.deepEqual(evaluate(source, {
    projeto: { collection: 'jfAdMyHouse' }, process: { env: { CRAWLER_HEADLESS: 'true' } },
  }), [true, false]);
});

test('Imperial vendas abre apenas navegador headless', () => {
  assert.deepEqual(evaluate(expression('../imperial/index.js', opening)), { headlessOverride: true });
});

test('Positivo vendas abre apenas navegador headless', () => {
  assert.deepEqual(evaluate(expression('../positivo/index.js', opening)), { headlessOverride: true });
});

test('RV vendas abre apenas navegador headless', () => {
  assert.deepEqual(evaluate(expression('../rvNegocios/index.js', opening)), { headlessOverride: true });
});

test('Fontes vendas e rota externa abrem apenas navegador headless sem fallback visivel', () => {
  assert.deepEqual(evaluate(expression('../fontes/index.js', opening)), { headlessOverride: true });
  const source = fs.readFileSync(new URL('../fontes/index.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /modosHeadlessTentativa|naoHeadless|não-headless|headlessOverride:\s*false/);
  const launch = node => node.type === 'CallExpression' && node.callee.object?.name === 'puppeteer'
    && node.callee.property?.name === 'launch' && node.arguments[0];
  assert.deepEqual(evaluate(expression('../fontes/extractor-00-rotaExterna.js', launch)), { headless: true });
});
