import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import axios from 'axios';
import { appendEndereco, extractEnderecoRobustCrm, enrichImoveisWithInternalData } from './enrichRobustCrmAddress.js';

const endereco = 'Rua Santo Antônio, Centro, Juiz de Fora, MG, 36016-210';
const localizacao = 'Cond. Ed. José Augusto Alves no bairro Centro, Juiz de Fora, MG';

test('extrai o endereço completo do detalhe RobustCRM', () => {
  const html = `<div class="imovel--location--address"><a>${endereco}</a></div>`;
  assert.equal(extractEnderecoRobustCrm(html), endereco);
});

test('anexa o endereço sem apagar nem duplicar a localização', () => {
  const localizacaoCompleta = `${localizacao} - ${endereco}`;
  assert.equal(appendEndereco(localizacao, endereco), localizacaoCompleta);
  assert.equal(appendEndereco(localizacaoCompleta, endereco), localizacaoCompleta);
  assert.equal(appendEndereco(localizacao, ''), localizacao);
});

test('404 persistente preserva registro depois das tentativas e continua os seguintes', async () => {
  const calls = [];
  const records = [{ linkReal: 'https://example.com/404', localizacao, preco: 100000 }, { linkReal: 'https://example.com/ativo', localizacao, preco: 200000 }];
  const request = mock.method(axios, 'get', async url => {
    calls.push(url);
    if (url.endsWith('/404')) throw Object.assign(new Error('Request failed with status code 404'), { response: { status: 404 } });
    return { data: `<div class="imovel--location--address"><a>${endereco}</a></div>` };
  });
  const warnings = [];
  const warn = mock.method(console, 'warn', message => warnings.push(message));
  const timer = mock.method(globalThis, 'setTimeout', callback => { queueMicrotask(callback); return 0; });
  try {
    const result = await enrichImoveisWithInternalData({}, records);
    assert.equal(result.length, 2);
    assert.equal(result[0].localizacao, localizacao);
    assert.equal(result[0].preco, 100000);
    assert.equal(result[0].dataExclusao, undefined);
    assert.equal(result[1].localizacao, `${localizacao} - ${endereco}`);
    assert.deepEqual(calls, [records[0].linkReal, records[0].linkReal, records[0].linkReal, records[1].linkReal]);
    assert.match(warnings[0], /HTTP 404.*Localizacao preservada/);
  } finally { request.mock.restore(); warn.mock.restore(); timer.mock.restore(); }
});

test('404 temporario recupera endereco quando a proxima tentativa responde 200', async () => {
  let calls = 0;
  const request = mock.method(axios, 'get', async () => {
    calls++;
    if (calls === 1) throw Object.assign(new Error('HTTP 404'), { response: { status: 404 } });
    return { data: `<div class="imovel--location--address">${endereco}</div>` };
  });
  const timer = mock.method(globalThis, 'setTimeout', callback => { queueMicrotask(callback); return 0; });
  try {
    const records = [{ linkReal: 'https://example.com/404-temporario', localizacao }];
    await enrichImoveisWithInternalData({}, records);
    assert.equal(calls, 2);
    assert.equal(records[0].localizacao, `${localizacao} - ${endereco}`);
  } finally { request.mock.restore(); timer.mock.restore(); }
});

test('falhas temporarias de HTTP continuam com tres tentativas', async () => {
  let calls = 0;
  const request = mock.method(axios, 'get', async () => {
    calls++;
    if (calls < 3) throw Object.assign(new Error('HTTP 503'), { response: { status: 503 } });
    return { data: `<div class="imovel--location--address">${endereco}</div>` };
  });
  const timer = mock.method(globalThis, 'setTimeout', callback => { queueMicrotask(callback); return 0; });
  try {
    const records = [{ linkReal: 'https://example.com/temporario', localizacao }];
    await enrichImoveisWithInternalData({}, records);
    assert.equal(calls, 3);
    assert.equal(records[0].localizacao, `${localizacao} - ${endereco}`);
  } finally { request.mock.restore(); timer.mock.restore(); }
});

test('modo estrito interrompe apos falha persistente no detalhe', async () => {
  let calls = 0;
  const request = mock.method(axios, 'get', async () => {
    calls++;
    throw Object.assign(new Error('HTTP 503'), { response: { status: 503 } });
  });
  const timer = mock.method(globalThis, 'setTimeout', callback => { queueMicrotask(callback); return 0; });
  try {
    await assert.rejects(enrichImoveisWithInternalData({}, [{ linkReal: 'https://example.com/1', localizacao }], { exigirDetalhes: true }), /Falha ao extrair dados complementares/);
    assert.equal(calls, 3);
  } finally { request.mock.restore(); timer.mock.restore(); }
});