import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {normalizeAndExpand,getAbbreviationList} from '../../../../deploy/routes/abbreviations.js';
import {extractTipoImovel} from '../1000Imoveis/extractor-05-tipoImovel.js';
import imoveisRouter from '../../../../api/imoveis.js';
import {resolverTipoCatalogo,resolverTipoCatalogoContido,catalogoTiposAlugueis,listarPendenciasTipoAlugueis,resolverTipoAlugueis,aplicarCorrecoesTipoAlugueis} from './tipos-alugueis.js';

const {projectImovelForTypesense}=createRequire(import.meta.url)('../../../../_02utils/typesense/projectImovelForTypesense.cjs');

test('Sitio e o nome principal de granja sem perder Casa de Campo e demais aliases',()=>{
  for (const relative of ['../../../../_03database/filtros/_brTipoImovel.json','../../../../../_colab/_03database/filtros/_brTipoImovel.json']) {
    const catalog=JSON.parse(fs.readFileSync(new URL(relative,import.meta.url),'utf8'));
    assert.equal(catalog.tiposFiltro.diversos.find(item=>item.slug==='granja').nome,'Sítio');
    assert.equal(catalog.tiposPorSlug.granja[0].nome,'Sítio');
    assert.equal(catalog.tiposPorSlug.granja.filter(item=>item.nome==='Sítio').length,1);
    for (const alias of ['Casa de Campo','Granja','Chácara','Chacara','Sítio','SÍTIO','Sitio','granja']) {
      assert.equal(resolverTipoCatalogo(alias,catalog),'granja');
    }
  }
  const root=fileURLToPath(new URL('../../../../',import.meta.url));
  assert.equal(catalogoTiposAlugueis(root).typeOptions.find(item=>item.slug==='granja').nome,'Sítio');
  for (const negociacao of ['venda','aluguel']) {
    const projected=projectImovelForTypesense({tipoImovel:'granja',negociacao});
    assert.equal(projected.tipoImovel,'granja');
    assert.equal(projected.tipoImovelNome,'Sítio');
  }
});

test('Sala e o nome principal nos catalogos, seletores, filtros e Typesense sem perder aliases',()=>{
  for (const relative of ['../../../../_03database/filtros/_brTipoImovel.json','../../../../../_colab/_03database/filtros/_brTipoImovel.json']) {
    const catalog=JSON.parse(fs.readFileSync(new URL(relative,import.meta.url),'utf8'));
    assert.equal(catalog.tiposFiltro.comercial.find(item=>item.slug==='sala').nome,'Sala');
    assert.equal(catalog.tiposPorSlug.sala[0].nome,'Sala');
    assert.equal(catalog.tiposPorSlug.sala.filter(item=>item.nome==='Sala').length,1);
    for (const alias of ['Sala','SALA','sala','Salas','Sala comercial','Centro Clinico','CENTRO CLÍNICO','Cj Comercial','Conjunto','Conjunto Comercial / Sala','Commercial / Office']) {
      assert.equal(resolverTipoCatalogo(alias,catalog),'sala');
    }
    assert.equal(resolverTipoCatalogo('Salão',catalog),'salao');
    assert.equal(resolverTipoCatalogo('Laje',catalog),'salao');
    assert.equal(resolverTipoCatalogo('Lajes Corporativas',catalog),'salao');
    assert.equal(resolverTipoCatalogo('Loja',catalog),'loja');
  }
  const root=fileURLToPath(new URL('../../../../',import.meta.url));
  assert.equal(catalogoTiposAlugueis(root).typeOptions.find(item=>item.slug==='sala').nome,'Sala');
  const route=imoveisRouter.stack.find(layer=>layer.route?.path==='/tipos').route.stack[0].handle;
  let response;
  route({}, {json:body=>{response=body;}});
  assert.ok(response.tipos.some(item=>item.nome==='Sala' && item.slug==='sala'));
  for (const negociacao of ['venda','aluguel']) {
    const projected=projectImovelForTypesense({tipoImovel:'sala',negociacao});
    assert.equal(projected.tipoImovel,'sala');
    assert.equal(projected.tipoImovelNome,'Sala');
    assert.equal(projected.negociacao,negociacao);
  }
});

test('painel de vendas expoe Sala como tipo principal nos filtros e na selecao de correcao',()=>{
  const source=fs.readFileSync(new URL('./jfora.js',import.meta.url),'utf8');
  const catalog=fs.readFileSync(new URL('../../../../_03database/filtros/_brTipoImovel.json',import.meta.url),'utf8');
  const responses=[];
  for (const route of ['/api/filters/tipos','/api/tipo-imovel-json-issues']) {
    const start=source.indexOf(`app.get("${route}"`);
    const end=source.indexOf('\n});',start)+4;
    assert.ok(start>=0 && end>start);
    vm.runInNewContext(source.slice(start,end),{
      app:{get:(_url,handler)=>handler({},{
        json:body=>responses.push(body),
        status:()=>({json:body=>assert.fail(body.error)}),
      })},
      fs:{readFileSync:()=>catalog,existsSync:()=>false},
      path,backendRoot:'backend',tiposCatalogoPath:'catalogo',
      isPrincipal:item=>item?.principal==='sim',
    });
  }
  assert.equal(responses[0].items.find(item=>item.slug==='sala').nome,'Sala');
  assert.equal(responses[1].typeOptions.find(item=>item.slug==='sala').nome,'Sala');
});

test('aliases observados nas pendencias do painel resolvem para slugs canonicos',()=>{
  const expected={
    'Residential / Apartment':'apartamento',
    'Residential / Penthouse':'cobertura',
    'Residential / Home':'casa',
    'Residential / Sobrado':'casa',
    'Chalé':'casa',
    'Armazém':'galpao',
    'Conjugado':'loft',
    'Kitnet/Conjugado':'loft',
    'KitnetConjugado':'loft',
    'Residential / Kitnet':'loft',
    'Residential / Studio':'loft',
    'Residential / Flat':'flat',
    'Residential / Land Lot':'terreno',
    'Prédio Comercial':'predio',
    'Box/Garagem':'garagem',
    'Escritório':'sala',
    'Commercial / Business':'loja',
    'ponto comercial loja':'loja',
  };
  for (const relative of ['../../../../_03database/filtros/_brTipoImovel.json','../../../../../_colab/_03database/filtros/_brTipoImovel.json']) {
    const catalog=JSON.parse(fs.readFileSync(new URL(relative,import.meta.url),'utf8'));
    for (const [alias,slug] of Object.entries(expected)) assert.equal(resolverTipoCatalogo(alias,catalog),slug);
  }
});

test('Outros aparece nos filtros e projecoes com slug canonico',()=>{
  for (const relative of ['../../../../_03database/filtros/_brTipoImovel.json','../../../../../_colab/_03database/filtros/_brTipoImovel.json']) {
    const catalog=JSON.parse(fs.readFileSync(new URL(relative,import.meta.url),'utf8'));
    assert.ok(catalog.tiposFiltro.diversos.some(item=>item.nome==='Outros' && item.slug==='outros'));
    assert.deepEqual(catalog.tiposPorSlug.outros,[{nome:'Outros',slug:'outros',tipo:'diversos'}]);
    assert.equal(resolverTipoCatalogo('Outros',catalog),'outros');
  }
  const root=fileURLToPath(new URL('../../../../',import.meta.url));
  assert.ok(catalogoTiposAlugueis(root).typeOptions.some(item=>item.slug==='outros' && item.nome==='Outros'));
  const route=imoveisRouter.stack.find(layer=>layer.route?.path==='/tipos').route.stack[0].handle;
  let response;
  route({}, {json:body=>{response=body;}});
  assert.ok(response.tipos.some(item=>item.nome==='Outros' && item.slug==='outros'));
  for (const negociacao of ['venda','aluguel']) {
    const projected=projectImovelForTypesense({tipoImovel:'outros',negociacao});
    assert.equal(projected.tipoImovel,'outros');
    assert.equal(projected.tipoImovelNome,'Outros');
    assert.equal(projected.negociacao,negociacao);
  }
});

test('filtro Typesense inclui Outros com contagem e slug',()=>{
  const source=fs.readFileSync(new URL('../../../../_02utils/typesense/migrateImoveisToTypesense.cjs',import.meta.url),'utf8');
  const start=source.indexOf('      if (doc.tipoImovel) {');
  const end=source.indexOf('      // Bairro',start);
  assert.ok(start>=0 && end>start);
  const filtros={tipo:{}};
  const doc=projectImovelForTypesense({tipoImovel:'outros'});
  vm.runInNewContext(source.slice(start,end),{doc,filtros});
  assert.deepEqual({...filtros.tipo.outros},{id:'tipo:outros',nome:'Outros',slug:'outros',count:1});
});

test('exportacao Typesense gera filtro Sala com slug sala e contagem separada de Salao e Loja',()=>{
  const source=fs.readFileSync(new URL('../../../../_02utils/typesense/migrateImoveisToTypesense.cjs',import.meta.url),'utf8');
  const start=source.indexOf('      if (doc.tipoImovel) {');
  const end=source.indexOf('      // Bairro',start);
  assert.ok(start>=0 && end>start);
  for (const negociacao of ['venda','aluguel']) {
    const filtros={tipo:{}};
    for (const tipoImovel of ['sala','sala','salao','loja']) {
      const doc=projectImovelForTypesense({tipoImovel,negociacao});
      vm.runInNewContext(source.slice(start,end),{doc,filtros});
    }
    assert.deepEqual({...filtros.tipo.sala},{id:'tipo:sala',nome:'Sala',slug:'sala',count:2});
    assert.equal(filtros.tipo.salao.count,1);
    assert.equal(filtros.tipo.loja.count,1);
  }
});

test('correcao de aluguel aceita Sala e mantem o slug na nova coleta',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'tipo-sala-'));
  const projects=[{collection:'jfTeste'}];
  try {
    const catalogs=path.join(root,'_03database','filtros');
    fs.mkdirSync(catalogs,{recursive:true});
    fs.mkdirSync(path.join(root,'crawler'));
    fs.copyFileSync(new URL('../../../../_03database/filtros/_brTipoImovel.json',import.meta.url),path.join(catalogs,'_brTipoImovel.json'));
    const item={linkReal:'https://example.com/imovel/sala',codigoBase:'SA1',tipoImovel:''};
    fs.writeFileSync(path.join(root,'crawler','jfTesteLocacao.json'),JSON.stringify([item]));
    const pending=listarPendenciasTipoAlugueis(root,projects);
    assert.ok(pending.typeOptions.some(option=>option.slug==='sala' && option.nome==='Sala'));
    resolverTipoAlugueis(root,projects,{file:'jfTesteLocacao.json',linkReal:item.linkReal,tipoImovel:'sala'});
    assert.equal(listarPendenciasTipoAlugueis(root,projects).total,0);
    assert.equal(aplicarCorrecoesTipoAlugueis([item],'jfTeste',root)[0].tipoImovel,'sala');
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('Andar Corporativo e o nome de retorno de andar sem perder aliases antigos',()=>{
  for (const relative of ['../../../../_03database/filtros/_brTipoImovel.json','../../../../../_colab/_03database/filtros/_brTipoImovel.json']) {
    const catalog=JSON.parse(fs.readFileSync(new URL(relative,import.meta.url),'utf8'));
    assert.equal(catalog.tiposFiltro.comercial.find(item=>item.slug==='andar').nome,'Andar Corporativo');
    assert.equal(catalog.tiposPorSlug.andar[0].nome,'Andar Corporativo');
    for (const label of ['Andar','Andar Corporativo','andar']) assert.equal(resolverTipoCatalogo(label,catalog),'andar');
  }
  const root=fileURLToPath(new URL('../../../../',import.meta.url));
  assert.equal(catalogoTiposAlugueis(root).typeOptions.find(item=>item.slug==='andar').nome,'Andar Corporativo');
  for (const negociacao of ['venda','locacao']) {
    const result=projectImovelForTypesense({tipoImovel:'andar',negociacao});
    assert.equal(result.tipoImovel,'andar');
    assert.equal(result.tipoImovelNome,'Andar Corporativo');
  }
  const route=imoveisRouter.stack.find(layer=>layer.route?.path==='/tipos').route.stack[0].handle;
  let response;
  route({}, {json:body=>{response=body;}});
  assert.deepEqual(response.tipos.filter(item=>item.slug==='andar'),[{nome:'Andar Corporativo',slug:'andar'}]);
  for (const file of ['../../../../../frontend/busca/app.js','../../../../../frontend/login/js/buscaManual.js']) {
    const source=fs.readFileSync(new URL(file,import.meta.url),'utf8');
    assert.ok(source.includes('"Andar Corporativo"'));
    assert.ok(!source.includes('"Andar"'));
  }
});

test('todos os extratores mantem Cobertura separada e aceitam Andar Corporativo e seu alias',async()=>{
  for (const relative of ['../','../../../../../_colab/_01extractor/crawlers/jfora/']) {
    const directory=fileURLToPath(new URL(relative,import.meta.url));
    for (const project of fs.readdirSync(directory,{withFileTypes:true}).filter(entry=>entry.isDirectory())) {
      const extractor=path.join(directory,project.name,'extractor-05-tipoImovel.js');
      if (!fs.existsSync(extractor)) continue;
      const {extractTipoImovel:extract}=await import(pathToFileURL(extractor).href);
      for (const [label,expected] of [['Cobertura','cobertura'],['Apartamento','apartamento'],['Andar','andar'],['Andar Corporativo','andar'],['Sala','sala']]) {
        const html=`
          <div class="imovel-item--tipo"><span>${label} / Venda</span></div>
          <span class="ImovelCardInfo_colorOfTypePropertie__OWVB6">${label} / Venda</span>
          <p class="imovelcard__info__ref"><strong>Ref: 1</strong> - ${label}</p>
          <p class="search-feat-card__cat-trans"><strong>${label} &middot; Venda</strong></p>
          <h3 class="card-text">${label} em Centro</h3>
          <p class="card-with-buttons__title">${label}</p>
          <p class="card_split_vertically__type">${label}</p>
          <p class="MuiTypography-root MuiTypography-body2 body2 secondary-text text-align-left">${label}</p>
          <strong><a href="https://example.com/imovel/${expected}-1">${label}</a></strong>
          <strong>Ref: 1</strong>${label}<div></div>
          <h5 class="text-secondary hover-text-primary mb-2">${label}</h5>
          <h4><a href="https://example.com/imovel/${expected}-1">${label}</a></h4>
          <span class="type">${label}</span>
          <li class="ng-binding"><i class="fas fa-home icons-detalhe"></i>${label}</li>
          <div class="imovel-item--cod">1 / ${label}</div>
          <div class="rh_content"><span style="color: #000000;">${label}</span></div>
          <h2 class="CardApartamentHorizontal_property_type">${label}</h2>
          <h3><a class="wpgb-block-11">${label}</a></h3>`;
        if (extract.constructor.name==='AsyncFunction') {
          const card={$eval:async(selector,callback)=>callback({textContent:label})};
          assert.equal(await extract(card),label==='Andar'?'Andar Corporativo':label,`${relative}${project.name}: ${label}`);
        } else {
          assert.equal(extract(html),expected,`${relative}${project.name}: ${label}`);
        }
      }
    }
  }
});

test('Cobertura e Apartamento sao tipos separados nos catalogos backend e Colab',()=>{
  for (const relative of ['../../../../_03database/filtros/_brTipoImovel.json','../../../../../_colab/_03database/filtros/_brTipoImovel.json']) {
    const catalog=JSON.parse(fs.readFileSync(new URL(relative,import.meta.url),'utf8'));
    assert.ok(catalog.tiposFiltro.residencial.some(item=>item.nome==='Cobertura' && item.slug==='cobertura'));
    for (const alias of ['Cobertura','COBERTURA','Coberturas','Cobertura Duplex','Cobertura Triplex','Cobertura / Penthouse','Penthouse']) {
      assert.equal(resolverTipoCatalogo(alias,catalog),'cobertura');
    }
    assert.equal(resolverTipoCatalogo('Apartamento',catalog),'apartamento');
    assert.equal(resolverTipoCatalogo('Duplex',catalog),'apartamento');
    assert.equal(resolverTipoCatalogo('Triplex',catalog),'apartamento');
  }
});

test('extracao, busca e projecao Typesense preservam cobertura separada em vendas e alugueis',()=>{
  for (const negocio of ['Venda','Locacao']) {
    assert.equal(extractTipoImovel(`<div class="imovel-item--tipo"><span>Cobertura / ${negocio}</span></div>`),'cobertura');
    assert.equal(extractTipoImovel(`<div class="imovel-item--tipo"><span>Apartamento / ${negocio}</span></div>`),'apartamento');
  }
  for (const alias of ['cobertura','coberturas','cob','penthouse']) assert.equal(normalizeAndExpand(alias),'cobertura');
  assert.ok(getAbbreviationList('tipoImovel').includes('cobertura'));
  for (const negociacao of ['venda','locacao']) {
    const projected=projectImovelForTypesense({tipoImovel:'cobertura',negociacao});
    assert.equal(projected.tipoImovel,'cobertura');
    assert.equal(projected.tipoImovelNome,'Cobertura');
    assert.equal(projected.negociacao,negociacao);
  }
});

test('tipos e aliases viram slugs canonicos sem inventar resultado desconhecido ou ambiguo',()=>{
  assert.equal(resolverTipoCatalogo('Apartamento'),'apartamento');
  assert.equal(resolverTipoCatalogo('GALPÃO'),'galpao');
  assert.equal(resolverTipoCatalogo('Sobrado'),'casa');
  assert.equal(resolverTipoCatalogo('Casa Comercial'),'casa-comercial');
  assert.equal(resolverTipoCatalogo('Studio'),'loft');
  assert.equal(resolverTipoCatalogo('apartamento'),'apartamento');
  assert.equal(resolverTipoCatalogo('Quarto'),'');
  assert.equal(resolverTipoCatalogo('Tipo desconhecido'),'');
});

test('resolve slug pelo alias completo contido na descricao e escolhe o alias mais especifico',()=>{
  assert.equal(resolverTipoCatalogoContido('Apartamento Garden'),'apartamento');
  assert.equal(resolverTipoCatalogoContido('Apartamento Duplex'),'apartamento');
  assert.equal(resolverTipoCatalogoContido('Terreno Urbano'),'terreno');
  assert.equal(resolverTipoCatalogoContido('Casa de Campo'),'granja');
  assert.equal(resolverTipoCatalogoContido('Casa Comercial'),'casa-comercial');
  assert.equal(resolverTipoCatalogoContido('Casa e Apartamento'),'');
  assert.equal(resolverTipoCatalogoContido('Terrenoso Urbano'),'');
  assert.equal(resolverTipoCatalogoContido('Tipo desconhecido'),'');
});

test('atribuir tipo corrige so aluguel e persiste mesmo se o link mudar',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'tipos-alugueis-'));
  try {
    fs.mkdirSync(path.join(root,'crawler'));
    fs.mkdirSync(path.join(root,'_03database/filtros'),{recursive:true});
    fs.writeFileSync(path.join(root,'_03database/filtros/_brTipoImovel.json'),JSON.stringify({tiposPorSlug:{apartamento:[{nome:'Apartamento'}],cobertura:[{nome:'Cobertura'}],casa:[{nome:'Casa'}]}}));
    const sale=JSON.stringify([{linkReal:'https://example.com/1',tipoImovel:'VENDA'}]);
    fs.writeFileSync(path.join(root,'crawler/jfTeste.json'),sale);
    fs.writeFileSync(path.join(root,'crawler/jfTesteLocacao.json'),JSON.stringify([{linkReal:'https://example.com/1',codigoBase:'1',tipoImovel:'Apartamento',preco:900}]));
    const projects=[{collection:'jfTeste'}];
    assert.equal(listarPendenciasTipoAlugueis(root,projects).totalForaDoCatalogo,1);
    assert.ok(listarPendenciasTipoAlugueis(root,projects).typeOptions.some(item=>item.slug==='cobertura' && item.nome==='Cobertura'));
    const body={file:'jfTesteLocacao.json',linkReal:'https://example.com/1',tipoImovel:'apartamento'};
    assert.equal(resolverTipoAlugueis(root,projects,body).tipoImovel,'apartamento');
    assert.equal(listarPendenciasTipoAlugueis(root,projects).total,0);
    assert.equal(aplicarCorrecoesTipoAlugueis([{linkReal:'https://example.com/novo',codigoBase:'1',tipoImovel:'Casa'}],'jfTeste',root)[0].tipoImovel,'apartamento');
    assert.equal(resolverTipoAlugueis(root,projects,{...body,tipoImovel:'cobertura'}).tipoImovel,'cobertura');
    assert.equal(aplicarCorrecoesTipoAlugueis([{linkReal:'https://example.com/novo',codigoBase:'1',tipoImovel:'Apartamento'}],'jfTeste',root)[0].tipoImovel,'cobertura');
    assert.equal(listarPendenciasTipoAlugueis(root,projects).total,0);
    assert.throws(()=>resolverTipoAlugueis(root,projects,{...body,file:'jfTeste.json'}),/somente JSONs/);
    assert.throws(()=>resolverTipoAlugueis(root,projects,{...body,tipoImovel:'Apartamento'}),/slug/);
    assert.equal(fs.readFileSync(path.join(root,'crawler/jfTeste.json'),'utf8'),sale);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});