import fs from 'node:fs';
import path from 'node:path';

const slug = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const read = (file, fallback = []) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,'utf8')) : fallback;
const save = (file, data) => { fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,`${JSON.stringify(data,null,2)}\n`,'utf8'); };

export function catalogosBairroAlugueis(backendRoot) {
  const filters = path.join(backendRoot,'_03database/filtros');
  const extraPath = path.join(backendRoot,'_03database/outros/alugueis-bairros-catalogo.json');
  const cidades = read(path.join(filters,'_brCidades.json'));
  const bairros = [...read(path.join(filters,'_jfBairros.json')), ...read(extraPath)];
  const cityOptions = [...new Map(cidades.filter(city => city.principal !== 'nao').map(city => [city.slug,{slug:city.slug,nome:city.nome || city.slug}])).values()].sort((left,right)=>left.nome.localeCompare(right.nome,'pt-BR'));
  const bairroOptions = {};
  for (const bairro of bairros.filter(item => item.principal !== 'nao')) {
    const options = bairroOptions[bairro.cidade] || (bairroOptions[bairro.cidade] = []);
    if (!options.some(item=>item.slug===bairro.slug)) options.push(bairro);
  }
  for (const options of Object.values(bairroOptions)) options.sort((left,right)=>String(left.nome || left.slug).localeCompare(String(right.nome || right.slug),'pt-BR'));
  return {cidades,bairros,cityOptions,bairroOptions,extraPath};
}

export function listarPendenciasBairroAlugueis(backendRoot, projects, offset = 0, limit = 100) {
  const catalogs = catalogosBairroAlugueis(backendRoot);
  const issues = [];
  for (const project of projects) {
    const file = `${project.collection}Locacao.json`;
    const data = read(path.join(backendRoot,'crawler',file));
    if (!Array.isArray(data)) throw new Error(`JSON invalido: ${file}`);
    data.forEach((item,index) => {
      if (String(item.dataExclusao || '').trim()) return;
      const bairro = String(item.bairro || '').trim();
      const cidade = String(item.cidade || '').trim();
      const motivo = !bairro ? 'vazio' : !(catalogs.bairroOptions[cidade] || []).some(option=>option.slug===bairro) ? 'fora-do-catalogo' : bairro===bairro.toUpperCase() && bairro!==bairro.toLowerCase() ? 'maiusculo' : '';
      if (motivo) issues.push({ file,index,bairro,cidade,titulo:item.titulo || '',linkReal:item.linkReal || '',codigoBase:item.codigoBase || '',motivo });
    });
  }
  const priority = {'fora-do-catalogo':0,vazio:1,maiusculo:2};
  issues.sort((left,right)=>(priority[left.motivo]-priority[right.motivo]) || left.file.localeCompare(right.file,'pt-BR') || left.index-right.index);
  const totalByMotivo = issues.reduce((totals,item)=>{ totals[item.motivo]=(totals[item.motivo] || 0)+1; return totals; },{});
  return {ok:true,total:issues.length,offset,limit,hasMore:offset+limit<issues.length,totalByMotivo,issues:issues.slice(offset,offset+limit),bairroOptions:catalogs.bairroOptions,cityOptions:catalogs.cityOptions};
}

export function resolverBairroAlugueis(backendRoot, projects, body) {
  const project = projects.find(item=>`${item.collection}Locacao.json`===body.file);
  if (!project) throw new Error('Arquivo invalido: corrija somente JSONs ativos de aluguel.');
  if (!['assign','create'].includes(body.mode)) throw new Error('Modo invalido.');
  const catalogs = catalogosBairroAlugueis(backendRoot);
  const cidade = String(body.targetCidade || '').trim();
  if (!catalogs.cityOptions.some(item=>item.slug===cidade)) throw new Error('Cidade invalida para atribuicao.');
  const file = path.join(backendRoot,'crawler',body.file);
  const data = read(file);
  const index = data.findIndex(item=>item.linkReal===body.linkReal && !String(item.dataExclusao || '').trim());
  if (index < 0) throw new Error('Registro ativo nao encontrado pelo linkReal.');
  let bairro = String(body.targetSlug || '').trim();
  let nome = String(body.targetNome || '').trim();
  if (body.mode==='create') {
    bairro = slug(bairro || nome);
    if (!bairro) throw new Error('Informe nome ou slug do novo bairro.');
    nome = nome || bairro.replace(/-/g,' ');
    if (!catalogs.bairros.some(item=>item.slug===bairro && item.cidade===cidade)) {
      const extras = read(catalogs.extraPath);
      extras.push({nome,slug:bairro,cidade,principal:'sim'});
      save(catalogs.extraPath,extras);
    }
  } else {
    const found = (catalogs.bairroOptions[cidade] || []).find(item=>item.slug===bairro);
    if (!found) throw new Error('Bairro invalido para atribuicao nesta cidade.');
    nome = found.nome || bairro;
  }
  const correctionsPath = path.join(backendRoot,'_03database/outros/alugueis-bairro-correcoes.json');
  const corrections = read(correctionsPath);
  const correction = {file:body.file,linkReal:body.linkReal,codigoBase:data[index].codigoBase || '',bairro,cidade,nome};
  const previous = corrections.findIndex(item=>item.file===body.file && item.linkReal===body.linkReal);
  if (previous < 0) corrections.push(correction); else corrections[previous]=correction;
  save(correctionsPath,corrections);
  data[index]={...data[index],bairro,cidade};
  save(file,data);
  return {ok:true,file:body.file,bairro,cidade,nome};
}

export function aplicarCorrecoesBairroAlugueis(records, collection, backendRoot, suppliedCorrections) {
  const corrections = suppliedCorrections === undefined
    ? read(path.join(backendRoot,'_03database/outros/alugueis-bairro-correcoes.json')) : suppliedCorrections;
  if (!Array.isArray(corrections)) throw new Error('Correcoes de bairro de aluguel invalidas.');
  return records.map(item => {
    const correction = corrections.find(saved=>saved.file===`${collection}Locacao.json` && (saved.linkReal===item.linkReal || (saved.codigoBase && String(saved.codigoBase)===String(item.codigoBase))));
    return correction ? {...item,bairro:correction.bairro,cidade:correction.cidade} : item;
  });
}