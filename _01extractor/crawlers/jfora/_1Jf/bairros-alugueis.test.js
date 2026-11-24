import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {listarPendenciasBairroAlugueis,resolverBairroAlugueis,aplicarCorrecoesBairroAlugueis} from './bairros-alugueis.js';

test('bairro atribuido ou criado corrige somente aluguel e persiste para proxima raspagem', () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'bairros-alugueis-'));
  const projects=[{collection:'jfTeste'}];
  try {
    fs.mkdirSync(path.join(root,'crawler'));
    fs.mkdirSync(path.join(root,'_03database/filtros'),{recursive:true});
    fs.writeFileSync(path.join(root,'_03database/filtros/_brCidades.json'),JSON.stringify([{slug:'juiz-de-fora-mg',nome:'Juiz de Fora',principal:'sim'}]));
    const catalog=JSON.stringify([{slug:'centro',nome:'Centro',cidade:'juiz-de-fora-mg',principal:'sim'}]);
    fs.writeFileSync(path.join(root,'_03database/filtros/_jfBairros.json'),catalog);
    const sale=JSON.stringify([{linkReal:'https://example.com/1',bairro:'VENDA'}]);
    fs.writeFileSync(path.join(root,'crawler/jfTeste.json'),sale);
    fs.writeFileSync(path.join(root,'crawler/jfTesteLocacao.json'),JSON.stringify([{linkReal:'https://example.com/1',bairro:'',cidade:'juiz-de-fora-mg',codigoBase:'1',preco:900}]));
    const issues=listarPendenciasBairroAlugueis(root,projects);
    assert.equal(issues.total,1);
    assert.equal(issues.issues[0].linkReal,'https://example.com/1');
    const body={file:'jfTesteLocacao.json',linkReal:'https://example.com/1',mode:'assign',targetCidade:'juiz-de-fora-mg',targetSlug:'centro'};
    assert.equal(resolverBairroAlugueis(root,projects,body).bairro,'centro');
    assert.equal(listarPendenciasBairroAlugueis(root,projects).total,0);
    assert.equal(aplicarCorrecoesBairroAlugueis([{linkReal:'https://example.com/novo',codigoBase:'1',bairro:''}],'jfTeste',root)[0].bairro,'centro');
    assert.throws(()=>resolverBairroAlugueis(root,projects,{...body,file:'jfTeste.json'}),/somente JSONs/);
    assert.throws(()=>resolverBairroAlugueis(root,projects,{...body,targetCidade:'cidade-invalida'}),/Cidade invalida/);
    assert.equal(resolverBairroAlugueis(root,projects,{...body,mode:'create',targetSlug:'',targetNome:'Novo Bairro'}).bairro,'novo-bairro');
    assert.equal(listarPendenciasBairroAlugueis(root,projects).total,0);
    assert.equal(fs.readFileSync(path.join(root,'crawler/jfTeste.json'),'utf8'),sale);
    assert.equal(fs.readFileSync(path.join(root,'_03database/filtros/_jfBairros.json'),'utf8'),catalog);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});