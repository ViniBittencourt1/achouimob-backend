import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as cheerio from 'cheerio';
import { extractAreaValor } from './extractor-11-areaValor.js';

function cardWithArea(value) {
  const $ = cheerio.load(`<div class="property-box"><ul><li><i class="flaticon-square-layouting-with-black-square-in-east-area"></i> ${value}</li></ul></div>`);
  return $('.property-box');
}

test('Invest preserva decimais e milhares das areas exibidas no site', () => {
  for (const [text, expected] of [
    ['90,00m<sup>2</sup>', 90],
    ['115,38m<sup>2</sup>', 115.38],
    ['55,23m<sup>2</sup>', 55.23],
    ['43,20m<sup>2</sup>', 43.2],
    ['571,36m<sup>2</sup>', 571.36],
    ['1.092,00m<sup>2</sup>', 1092],
    ['1.234,56 m²', 1234.56],
    ['1.000.000,25 m²', 1000000.25],
    ['0,75m<sup>2</sup>', 0.75],
    ['120 m²', 120],
    ['1.092 m²', 1092],
    ['0,00m<sup>2</sup>', 0],
  ]) {
    assert.equal(extractAreaValor(cardWithArea(text)), expected, text);
  }
});

test('Invest nao interpreta o expoente da unidade como area ausente', () => {
  for (const text of ['', 'Consulte', 'm<sup>2</sup>']) {
    assert.equal(extractAreaValor(cardWithArea(text)), 0, text);
  }
  const $ = cheerio.load('<div class="property-box"><li>3 quartos</li></div>');
  assert.equal(extractAreaValor($('.property-box')), 0);
});
