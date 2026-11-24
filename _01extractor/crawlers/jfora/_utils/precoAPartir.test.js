import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as cheerio from 'cheerio';
import { aplicarPrecoAPartir } from './precoAPartir.js';

test('preco valido nao e alterado', () => {
  assert.equal(aplicarPrecoAPartir(450000, '<p>A partir de R$ 300.000</p>'), 450000);
});

test('preco zero ou ausente usa o valor apos "a partir"', () => {
  assert.equal(aplicarPrecoAPartir(0, '<p class="preco">A partir de <b>R$ 389.900,00</b></p>'), 389900);
  assert.equal(aplicarPrecoAPartir(null, 'Valores a partir R$1.250.000'), 1250000);
  assert.equal(aplicarPrecoAPartir('', 'a partir de: 520.000'), 520000);
});

test('preco acima de 10 milhoes usa o valor apos "a partir"', () => {
  assert.equal(aplicarPrecoAPartir(38990000, 'A partir de R$ 389.900,00'), 389900);
});

test('sem "a partir" ou sem numero logo depois mantem o preco original', () => {
  assert.equal(aplicarPrecoAPartir(0, 'Consulte'), 0);
  assert.equal(aplicarPrecoAPartir(null, 'Disponivel a partir de 10/2026'), null);
  assert.equal(aplicarPrecoAPartir(25000000, 'Sem valor'), 25000000);
});

test('aceita no do cheerio e respeita a negociacao', () => {
  const $ = cheerio.load('<div><span>Venda a partir de R$ 900.000</span><span>Locacao a partir de R$ 3.500</span></div>');
  assert.equal(aplicarPrecoAPartir(0, $('div')), 900000);
  assert.equal(aplicarPrecoAPartir(null, $('div'), 'locacao'), 3500);
});
