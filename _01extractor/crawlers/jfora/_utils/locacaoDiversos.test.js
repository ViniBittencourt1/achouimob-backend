import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mock, test } from 'node:test';
import { parsePrecoMegaLocacao } from '../mega/extractor.js';
import { mapOliveiraLocacao } from '../oliveira/extractor-locacao.js';
import { projetosLocacaoDiversos } from './locacaoDiversosProjetos.js';
import { validateInvestLocacaoPagination } from '../invest/extractor.js';

const calls=[];
let extracted=[{linkReal:'https://www.coutoguerraimoveis.com.br/detalhes-imovel/123.html',codigoBase:'CO74896',preco:32900}];
let countError = null;
mock.module('./locacaoContagem.js', {
  namedExports: { contarAntesDaLocacaoInvest: async (_browser, options) => {
    calls.push(['count', options]);
    if (countError) throw countError;
    return 1;
  }, contarAntesDaLocacaoKenlo: async (_browser, options) => {
    calls.push(['countOliveira', options]);
    if (countError) throw countError;
    return 1;
  }, contarAntesDaLocacaoMega: async (_browser, options) => {
    calls.push(['countMega', options]);
    if (countError) throw countError;
    return 1;
  }, contarAntesDaLocacaoCouto: async (_browser, options) => {
    calls.push(['countCouto', options]);
    if (countError) throw countError;
    return 1;
  } },
});
process.env.GOOGLE_SHEETS_SPREADSHEET_ID="1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY";
mock.module('node:fs',{defaultExport:{...fs,existsSync:()=>false,mkdirSync:(...args)=>calls.push(['mkdir',...args]),writeFileSync:(...args)=>calls.push(['json',...args])}});
mock.module('../../../services/puppeteerPool.js',{namedExports:{abrirBrowser:async()=>({close:async()=>calls.push(['close'])})}});
mock.module('../couto/extractor.js',{namedExports:{extractCoutoData:async(_browser,_codes,options)=>{calls.push(['extract',options]);return{imoveisRaspados:extracted};}}});
mock.module('../invest/extractor.js', {
  namedExports: { extractInvestData: async (_browser, options) => {
    calls.push(['extractInvest', options]);
    return { imoveisRaspados: [{ linkReal: 'https://www.invest.com.br/imovel/123', codigoBase: '123', preco: 900 }] };
  } },
});
mock.module('../oliveira/extractor-locacao.js', {
  namedExports: { extractOliveiraLocacao: async () => {
    calls.push(['extractOliveira']);
    return { imoveisRaspados: [{ linkReal: 'https://www.joliveirajf.com.br/imovel/apartamento/AP3272-JOLJ', codigoBase: 'AP3272-JOLJ', preco: 1300 }] };
  } },
});
mock.module('../mega/extractor.js', {
  namedExports: { extractMegaData: async (_browser, _codes, options) => {
    calls.push(['extractMega', options]);
    return { imoveisRaspados: [{ linkReal: 'https://megacasaimoveis.com.br/imovel/casa-alugar-teste', codigoBase: 'CA000875', preco: 10000 }] };
  } },
});
mock.module('../../../services/googleSheets.js',{namedExports:{ensureSheet: async (_id, title) => title, readSheet: async () => [], clearSheet:async(...args)=>calls.push(['clear',...args]),writeHeader:async(...args)=>calls.push(['header',...args]),writeSheet:async(...args)=>calls.push(['rows',...args])}});
const {loadProjetoDiversos,runProjetoDiversos,SPREADSHEET_LOCACAO_DIVERSOS}=await import('./locacaoDiversos.js');

test('Mega aluguel usa seu valor isolado, sem venda concatenada', () => {
  assert.equal(parsePrecoMegaLocacao('10.000'), 10000);
  assert.equal(parsePrecoMegaLocacao('11.500,50'), 11500.5);
  assert.throws(() => parsePrecoMegaLocacao('Venda 2.250.000 Aluguel 10.000'), /nao identificado/);
});

test('Oliveira novo dominio Kenlo mapeia 20campos sem alterar venda Joomla', () => {
  const html = '<p class="card-with-buttons__title">Apartamento</p><h2 class="card-with-buttons__heading">S\u00e3o Pedro - Juiz de Fora - MG</h2><p class="card-with-buttons__code">AP3272-JOLJ</p><div class="card-with-buttons__value-container"><p class="card-with-buttons__value-title">Aluguel</p><p class="card-with-buttons__value">R$ 1.300/m\u00eas</p></div><ul><li>40 m\u00b2</li><li>1 Quarto</li></ul><img src="https://example.com/foto.jpg">';
  const item = mapOliveiraLocacao({ href: 'https://www.joliveirajf.com.br/imovel/apartamento/AP3272-JOLJ', html });
  assert.equal(Object.keys(item).length, 20);
  assert.equal(item.preco, 1300);
  assert.equal(item.areaValor, 40);
  assert.equal(item.bairro, 'sao-pedro');
});

test('quatro rotas conservam filtros de locacao corretos', () => {
  const urls = projetosLocacaoDiversos.map(item => new URL(item.url));
  assert.equal(urls[0].searchParams.get('finalidade_s'), '3');
  assert.equal(urls[1].searchParams.get('fin'), '2');
  assert.equal(urls[2].hostname, 'www.joliveirajf.com.br');
  assert.equal(urls[3].searchParams.get('_acao'), 'alugar');
});

for(const project of projetosLocacaoDiversos){
  test(`${project.collection}: modulos, consolidacao e Sheets unificados`,async()=>{
    const functions=await loadProjetoDiversos(project);
    const map=functions.consolidate([{linkReal:'teste',preco:1500}],new Map());
    assert.ok(map instanceof Map);
    calls.length=0;
    await functions.exportToSheets(map);
    assert.equal(calls.find(([name])=>name==='clear')[1],"1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY");
    calls.length=0;
    await functions.exportToSheets(map,{spreadsheetId:SPREADSHEET_LOCACAO_DIVERSOS,sheetName:project.collection});
    assert.equal(calls.find(([name])=>name==='clear')[1],SPREADSHEET_LOCACAO_DIVERSOS);
    assert.ok(calls.find(([name])=>name==='clear')[2].includes(project.collection));
    assert.equal(calls.find(([name])=>name==='header')[3].length,21);
  });
}

test('executor grava apenas locacao com filtros propios',async()=>{
  calls.length=0;
  await runProjetoDiversos('couto');
  assert.deepEqual(calls.find(([name]) => name === 'countCouto')[1], { projeto: 'jfCouto', url: projetosLocacaoDiversos.find(project => project.folder === 'couto').url });
  assert.ok(calls.findIndex(([name]) => name === 'countCouto') < calls.findIndex(([name]) => name === 'extract'));
  assert.ok(!calls.some(([name]) => ['count', 'countOliveira', 'countMega'].includes(name)));
  assert.match(calls.find(([name])=>name==='json')[1],/jfCoutoLocacao\.json$/);
  assert.equal(calls.find(([name])=>name==='extract')[1].preservarPreco,true);
  assert.equal(new URL(calls.find(([name])=>name==='extract')[1].baseUrl).searchParams.get('finalidade_s'),'3');
});

test('Invest registra precontagem antes da extracao sem gravar vendas ou skip', async () => {
  calls.length = 0;
  await runProjetoDiversos('invest');
  assert.deepEqual(calls.find(([name]) => name === 'count')[1], { projeto: 'jfInvest', url: projetosLocacaoDiversos.find(project => project.folder === 'invest').url });
  assert.ok(calls.findIndex(([name]) => name === 'count') < calls.findIndex(([name]) => name === 'extractInvest'));
  assert.equal(calls.find(([name]) => name === 'extractInvest')[1].strict, true);
  assert.ok(calls.filter(([name]) => name === 'json').every(call => String(call[1]).endsWith('jfInvestLocacao.json')));
  assert.deepEqual(calls.find(([name]) => name === 'clear'), ['clear', SPREADSHEET_LOCACAO_DIVERSOS, "jfInvest"]);
});

test('falha da precontagem Invest impede extracao e preserva arquivos e dados', async () => {
  calls.length = 0;
  countError = new Error('Contagem indisponivel');
  try {
    await assert.rejects(runProjetoDiversos('invest'), /Contagem indisponivel/);
    assert.ok(calls.some(([name]) => name === 'close'));
    assert.ok(!calls.some(([name]) => ['extractInvest', 'json', 'clear', 'rows'].includes(name)));
  } finally { countError = null; }
});

test('Oliveira registra 47 antes da extracao e preserva destinos de vendas', async () => {
  calls.length = 0;
  await runProjetoDiversos('jfOliveira');
  assert.deepEqual(calls.find(([name]) => name === 'countOliveira')[1], { projeto: 'jfOliveira', url: projetosLocacaoDiversos.find(project => project.folder === 'oliveira').url });
  assert.ok(calls.findIndex(([name]) => name === 'countOliveira') < calls.findIndex(([name]) => name === 'extractOliveira'));
  assert.match(calls.find(([name]) => name === 'json')[1], /jfOliveiraLocacao\.json$/);
  assert.deepEqual(calls.find(([name]) => name === 'clear'), ['clear', SPREADSHEET_LOCACAO_DIVERSOS, 'jfOliveira']);
});

test('falha da precontagem Oliveira impede extracao e preserva dados', async () => {
  calls.length = 0;
  countError = new Error('Contagem indisponivel');
  try {
    await assert.rejects(runProjetoDiversos('oliveira'), /Contagem indisponivel/);
    assert.ok(calls.some(([name]) => name === 'close'));
    assert.ok(!calls.some(([name]) => ['extractOliveira', 'json', 'clear', 'rows'].includes(name)));
  } finally { countError = null; }
});

test('Mega registra 10 antes da extracao e usa destinos exclusivos de locacao', async () => {
  calls.length = 0;
  await runProjetoDiversos('jfMega');
  assert.deepEqual(calls.find(([name]) => name === 'countMega')[1], { projeto: 'jfMega', url: projetosLocacaoDiversos.find(project => project.folder === 'mega').url });
  assert.ok(calls.findIndex(([name]) => name === 'countMega') < calls.findIndex(([name]) => name === 'extractMega'));
  assert.equal(calls.find(([name]) => name === 'extractMega')[1].strict, true);
  assert.match(calls.find(([name]) => name === 'json')[1], /jfMegaLocacao\.json$/);
  assert.deepEqual(calls.find(([name]) => name === 'clear'), ['clear', SPREADSHEET_LOCACAO_DIVERSOS, 'jfMega']);
});

test('falha da precontagem Mega impede extracao e preserva dados', async () => {
  calls.length = 0;
  countError = new Error('Contagem indisponivel');
  try {
    await assert.rejects(runProjetoDiversos('mega'), /Contagem indisponivel/);
    assert.ok(calls.some(([name]) => name === 'close'));
    assert.ok(!calls.some(([name]) => ['extractMega', 'json', 'clear', 'rows'].includes(name)));
  } finally { countError = null; }
});

test('falha da precontagem Couto impede extracao e preserva dados', async () => {
  calls.length = 0;
  countError = new Error('Contagem indisponivel');
  try {
    await assert.rejects(runProjetoDiversos('jfCouto'), /Contagem indisponivel/);
    assert.ok(calls.some(([name]) => name === 'close'));
    assert.ok(!calls.some(([name]) => ['extract', 'json', 'clear', 'rows'].includes(name)));
  } finally { countError = null; }
});

test('coleta vazia nao altera destinos',async()=>{
  calls.length=0;
  extracted=[];
  await assert.rejects(runProjetoDiversos('couto'),/Nenhum aluguel/);
  assert.ok(!calls.some(([name])=>['json','clear','rows'].includes(name)));
});

test('Invest pagina nativa conserva28itens finais e fin2',()=>{
  const base='https://www.invest.com.br/ResultadoBusca.aspx?fin=2&tit=Imovel-para-Locacao';
  const url=new URL(validateInvestLocacaoPagination('ResultadoBusca.aspx?pag=2&qtdeitens=28&posicao=135&fin=2',base,2));
  assert.equal(url.searchParams.get('qtdeitens'),'28');
  assert.equal(url.searchParams.get('posicao'),'135');
  assert.throws(()=>validateInvestLocacaoPagination('ResultadoBusca.aspx?pag=2&fin=1',base,2),/fora da locacao/);
});