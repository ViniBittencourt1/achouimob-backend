import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mock, test } from 'node:test';
import { CABECALHO_SHEETS } from './sheetsCampos.js';
const calls=[];
let countError = null;
let sheetRows = [];
mock.module('./locacaoContagem.js', {
  namedExports: { registrarTotalLocacao: async (...args) => {
    calls.push(['count', ...args]);
    if (countError) throw countError;
  } },
});
mock.module('node:fs',{defaultExport:{...fs,mkdirSync:(...args)=>calls.push(['mkdir',...args]),writeFileSync:(...args)=>calls.push(['json',...args])}});
mock.module('../../../services/googleSheets.js',{namedExports:{ensureSheet:async(_id,title)=>title,readSheet:async()=>sheetRows,clearSheet:async(...args)=>calls.push(['clear',...args]),writeHeader:async(...args)=>calls.push(['header',...args]),writeSheet:async(...args)=>calls.push(['rows',...args])}});
const {prepararLocacaoSemRota,SPREADSHEET_PREPARACAO_LOCACAO}=await import('./locacaoPreparacao.js');

for(const [name,collection]of [['gm','jfGm'],['kantto','jfKantto'],['souzaRocha','jfSouzaRocha']]){
  test(`${collection}: sem rota retorna0 e zera apenas destinos de locacao`,async()=>{
    calls.length=0;
    assert.equal(await prepararLocacaoSemRota(name),0);
    assert.deepEqual(calls.find(([kind]) => kind === 'count'), ['count', collection, 0, SPREADSHEET_PREPARACAO_LOCACAO]);
    assert.ok(calls.findIndex(([kind]) => kind === 'count') < calls.findIndex(([kind]) => kind === 'json'));
    assert.match(calls.find(([kind])=>kind==='json')[1],new RegExp(`${collection}Locacao\\.json$`));
    assert.equal(calls.find(([kind])=>kind==='json')[2],'[]');
    assert.deepEqual(calls.find(([kind])=>kind==='clear'),['clear',SPREADSHEET_PREPARACAO_LOCACAO,collection]);
    assert.equal(calls.find(([kind])=>kind==='header')[3].length,21);
    assert.ok(!calls.some(([kind])=>kind==='rows'));
  });
}

test('GM remove apenas aluguel da aba compartilhada, preservando linhas de venda', async () => {
  const sale = Array(20).fill('');
  sale[0] = 'https://example.com/venda';
  const rental = Array(20).fill('');
  rental[0] = 'https://example.com/aluguel';
  sheetRows = [[...CABECALHO_SHEETS, 'negociacao'], [...sale, 'venda'], [...rental, 'aluguel']];
  calls.length = 0;
  try {
    await prepararLocacaoSemRota('gm');
    const written = calls.find(([kind]) => kind === 'rows');
    assert.deepEqual(written[3], [[...sale, 'venda']]);
  } finally { sheetRows = []; }
});

for (const collection of ['jfGm', 'jfKantto', 'jfSouzaRocha']) {
  test(`${collection}: nao mascara falha de gravacao do zero em retorno`, async () => {
    calls.length = 0;
    countError = new Error('Sheets da contagem indisponivel');
    try {
      await assert.rejects(prepararLocacaoSemRota(collection), /Sheets da contagem indisponivel/);
      assert.ok(!calls.some(([kind]) => ['json', 'clear', 'header', 'rows'].includes(kind)));
    } finally { countError = null; }
  });
}