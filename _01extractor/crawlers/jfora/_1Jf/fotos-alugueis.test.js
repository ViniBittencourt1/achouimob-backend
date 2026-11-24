import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {linkFotoValido,listarPendenciasFotoAlugueis,resolverFotoAlugueis,confirmarSemFotoAlugueis,confirmarFotoIndividualAlugueis,aplicarCorrecoesFotoAlugueis} from './fotos-alugueis.js';

test('foto manual e confirmacao sem foto ficam isoladas de vendas e nao ocultam URL invalida',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fotos-alugueis-'));
  const projects=[{collection:'jfTeste'}];
  try {
    fs.mkdirSync(path.join(root,'crawler'));
    const sales=JSON.stringify([{linkReal:'https://example.com/1',linkFoto:'VENDA'}]);
    fs.writeFileSync(path.join(root,'crawler/jfTeste.json'),sales);
    const file=path.join(root,'crawler/jfTesteLocacao.json');
    fs.writeFileSync(file,JSON.stringify([
      {linkReal:'https://example.com/1',codigoBase:'1',linkFoto:'',preco:900},
      {linkReal:'https://example.com/2',codigoBase:'2',linkFoto:'',preco:800},
      {linkReal:'https://example.com/3',codigoBase:'3',linkFoto:'javascript:teste'},
      {linkReal:'https://example.com/4',codigoBase:'4',linkFoto:'',dataExclusao:'2025-01-01'},
    ]));
    const pending=listarPendenciasFotoAlugueis(root,projects);
    assert.equal(pending.total,3);
    assert.equal(pending.projectStats[0].emptyLinkFotoCount,2);
    const body={file:'jfTesteLocacao.json',linkReal:'https://example.com/1',linkFoto:'https://example.com/foto.jpg'};
    assert.equal(resolverFotoAlugueis(root,projects,body).linkFoto,body.linkFoto);
    assert.equal(JSON.parse(fs.readFileSync(file,'utf8'))[0].preco,900);
    assert.equal(aplicarCorrecoesFotoAlugueis([{linkReal:'https://example.com/novo',codigoBase:'1',linkFoto:''}],'jfTeste',root)[0].linkFoto,body.linkFoto);
    assert.throws(()=>resolverFotoAlugueis(root,projects,{...body,file:'jfTeste.json'}),/somente JSONs/);
    assert.throws(()=>resolverFotoAlugueis(root,projects,{...body,linkFoto:'javascript:teste'}),/HTTP/);
    assert.equal(confirmarSemFotoAlugueis(root,projects).confirmed,1);
    const remaining=listarPendenciasFotoAlugueis(root,projects);
    assert.equal(remaining.total,1);
    assert.equal(remaining.issues[0].motivo,'invalido');
    assert.equal(confirmarSemFotoAlugueis(root,projects).confirmed,0);
    assert.equal(fs.readFileSync(path.join(root,'crawler/jfTeste.json'),'utf8'),sales);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('URLs de foto permitem somente HTTP ou HTTPS',()=>{
  assert.equal(linkFotoValido('https://example.com/foto.webp'),true);
  for (const value of ['',null,'0','file:///C:/foto.jpg','data:image/png;base64,x','javascript:teste']) assert.equal(linkFotoValido(value),false);
});

test('confirmacao individual remove somente o registro revisado e nao altera o JSON',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'foto-individual-'));
  const projects=[{collection:'jfTeste'}];
  try {
    fs.mkdirSync(path.join(root,'crawler'));
    const file=path.join(root,'crawler/jfTesteLocacao.json');
    const data=[{linkReal:'https://example.com/1',codigoBase:'1',linkFoto:''},{linkReal:'https://example.com/2',codigoBase:'2',linkFoto:'0'}];
    const original=JSON.stringify(data);
    fs.writeFileSync(file,original);
    const body={file:'jfTesteLocacao.json',linkReal:data[0].linkReal,linkFotoAtual:''};
    assert.equal(confirmarFotoIndividualAlugueis(root,projects,body).confirmed,1);
    assert.equal(listarPendenciasFotoAlugueis(root,projects).total,1);
    assert.equal(listarPendenciasFotoAlugueis(root,projects).issues[0].codigoBase,'2');
    assert.equal(confirmarFotoIndividualAlugueis(root,projects,body).confirmed,0);
    assert.equal(fs.readFileSync(file,'utf8'),original);
    assert.throws(()=>confirmarFotoIndividualAlugueis(root,projects,{...body,file:'jfTeste.json'}),/somente registros/);
    const invalid={...body,linkReal:data[1].linkReal,linkFotoAtual:'0'};
    assert.equal(confirmarFotoIndividualAlugueis(root,projects,invalid).confirmed,1);
    assert.equal(listarPendenciasFotoAlugueis(root,projects).total,0);
    data[1].linkFoto='';
    fs.writeFileSync(file,JSON.stringify(data));
    assert.equal(listarPendenciasFotoAlugueis(root,projects).total,1);
    assert.equal(confirmarSemFotoAlugueis(root,projects).confirmed,1);
    assert.equal(listarPendenciasFotoAlugueis(root,projects).total,0);
    data[1].linkFoto='URL alterada';
    fs.writeFileSync(file,JSON.stringify(data));
    assert.equal(listarPendenciasFotoAlugueis(root,projects).total,1);
    assert.throws(()=>confirmarFotoIndividualAlugueis(root,projects,invalid),/mudou/);
    data[1].linkFoto='https://example.com/foto.jpg';
    fs.writeFileSync(file,JSON.stringify(data));
    assert.throws(()=>confirmarFotoIndividualAlugueis(root,projects,{...invalid,linkFotoAtual:data[1].linkFoto}),/valido/);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});